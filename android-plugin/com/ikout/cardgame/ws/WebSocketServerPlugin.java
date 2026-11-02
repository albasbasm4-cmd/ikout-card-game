package com.ikout.cardgame.ws;

import android.annotation.SuppressLint;
import android.net.wifi.WifiManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.io.IOException;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Enumeration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import fi.iki.elonen.NanoHTTPD;
import fi.iki.elonen.NanoWSD;

/**
 * خادم WebSocket محلي مدمج بالتطبيق (Capacitor Plugin).
 * يسمح لجهاز المضيف باستقبال لاعبين عبر نقطة الاتصال (Hotspot) أو شبكة
 * Wi-Fi المحلية بدون أي سيرفر خارجي أو إنترنت.
 *
 * الأحداث (wsEvent):
 *  - { type: "CLIENT_CONNECTED",    clientId }
 *  - { type: "CLIENT_DISCONNECTED", clientId }
 *  - { type: "CLIENT_MESSAGE",      clientId, data }   (data كائن JSON)
 */
@CapacitorPlugin(name = "WebSocketServer")
public class WebSocketServerPlugin extends Plugin {

    private static final String EVENT_NAME = "wsEvent";
    private static final String[] HOTSPOT_IFACES = { "swlan0", "ap0", "softap0", "wlan1", "wlan2" };
    private static final long PING_INTERVAL_SECONDS = 15;

    private WsServer server;
    private final Map<String, WsSocket> clients = new ConcurrentHashMap<>();
    private final AtomicInteger nextId = new AtomicInteger(1);
    private final ScheduledExecutorService pinger = Executors.newSingleThreadScheduledExecutor(
        r -> {
            Thread t = new Thread(r, "wss-pinger");
            t.setDaemon(true);
            return t;
        }
    );

    private class WsSocket extends NanoWSD.WebSocket {
        final String id;
        final ScheduledFuture<?> pingTask;

        WsSocket(NanoHTTPD.IHTTPSession handshake, String id) {
            super(handshake);
            this.id = id;
            this.pingTask = pinger.scheduleAtFixedRate(
                () -> {
                    try {
                        if (isOpen()) {
                            ping("ping".getBytes(StandardCharsets.UTF_8));
                        }
                    } catch (IOException | IllegalStateException ignored) {
                    }
                },
                PING_INTERVAL_SECONDS,
                PING_INTERVAL_SECONDS,
                TimeUnit.SECONDS
            );
        }

        @Override
        protected void onOpen() {
            // الاتصال أُعلن عنه في openWebSocket
        }

        @Override
        protected void onClose(NanoWSD.WebSocketFrame.CloseCode code, String reason, boolean initiatedByRemote) {
            pingTask.cancel(false);
            handleSocketClosed(id);
        }

        @Override
        protected void onMessage(NanoWSD.WebSocketFrame message) {
            byte[] payload = message.getBinaryPayload();
            String raw = payload != null ? new String(payload, StandardCharsets.UTF_8) : "";
            if (!raw.isEmpty()) {
                handleSocketMessage(id, raw);
            }
        }

        @Override
        protected void onPong(NanoWSD.WebSocketFrame pong) {
            // تجاهل
        }

        @Override
        protected void onException(IOException exception) {
            // إغلاق غير نظيف: سيُعلن عند onClose
        }
    }

    private class WsServer extends NanoWSD {
        WsServer(int port) {
            super(port);
        }

        @Override
        protected WebSocket openWebSocket(NanoHTTPD.IHTTPSession handshake) {
            String id = "c" + nextId.getAndIncrement();
            WsSocket socket = new WsSocket(handshake, id);
            clients.put(id, socket);
            notifyEvent("CLIENT_CONNECTED", id, null);
            return socket;
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (server != null) {
            call.resolve();
            return;
        }
        int port = call.getInt("port", 8080);
        try {
            server = new WsServer(port);
            server.start(0, false);
            call.resolve();
        } catch (IOException e) {
            server = null;
            call.reject("START_FAILED", e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (server != null) {
            try {
                server.stop();
            } catch (Exception ignored) {
            }
            server = null;
        }
        for (WsSocket socket : clients.values()) {
            try {
                socket.close(NanoWSD.WebSocketFrame.CloseCode.NormalClosure, "server stopping", false);
            } catch (IOException ignored) {
            }
        }
        clients.clear();
        call.resolve();
    }

    @PluginMethod
    public void send(PluginCall call) {
        String clientId = call.getString("clientId");
        String message = call.getString("message");
        WsSocket socket = clientId != null ? clients.get(clientId) : null;
        if (socket != null && socket.isOpen()) {
            try {
                socket.send(message == null ? "" : message);
                call.resolve();
            } catch (IOException e) {
                call.reject("SEND_FAILED", e.getMessage());
            }
        } else {
            call.reject("CLIENT_NOT_FOUND", clientId);
        }
    }

    @PluginMethod
    public void broadcast(PluginCall call) {
        String message = call.getString("message");
        for (WsSocket socket : clients.values()) {
            if (socket.isOpen()) {
                try {
                    socket.send(message == null ? "" : message);
                } catch (IOException ignored) {
                }
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void closeClient(PluginCall call) {
        String clientId = call.getString("clientId");
        WsSocket socket = clientId != null ? clients.remove(clientId) : null;
        if (socket != null) {
            try {
                socket.close(NanoWSD.WebSocketFrame.CloseCode.NormalClosure, "closed by server", false);
            } catch (IOException ignored) {
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void getIpAddress(PluginCall call) {
        JSObject res = new JSObject();
        res.put("ip", detectHostIp());
        call.resolve(res);
    }

    @PluginMethod
    public void getGatewayIp(PluginCall call) {
        String ip = null;
        try {
            WifiManager wifi = (WifiManager) getContext().getApplicationContext()
                .getSystemService(android.content.Context.WIFI_SERVICE);
            if (wifi != null) {
                android.net.DhcpInfo dhcp = wifi.getDhcpInfo();
                if (dhcp != null && dhcp.gateway != 0) {
                    ip = intToIp(dhcp.gateway);
                }
            }
        } catch (Exception ignored) {
        }
        JSObject res = new JSObject();
        res.put("ip", ip);
        call.resolve(res);
    }

    // ---- داخلي ----

    private void notifyEvent(String type, String clientId, Object data) {
        JSObject payload = new JSObject();
        payload.put("type", type);
        payload.put("clientId", clientId);
        if (data != null) payload.put("data", data);
        notifyListeners(EVENT_NAME, payload);
    }

    private void handleSocketMessage(String clientId, String raw) {
        Object data = raw;
        try {
            data = new org.json.JSONObject(raw);
        } catch (JSONException ignored) {
            // ليست JSON: نمرر النص كما هو
        }
        notifyEvent("CLIENT_MESSAGE", clientId, data);
    }

    private void handleSocketClosed(String clientId) {
        clients.remove(clientId);
        notifyEvent("CLIENT_DISCONNECTED", clientId, null);
    }

    private static String intToIp(int value) {
        return (value & 0xFF) + "." + ((value >> 8) & 0xFF) + "." + ((value >> 16) & 0xFF) + "."
            + ((value >> 24) & 0xFF);
    }

    private static String detectHostIp() {
        String wifiIp = null;
        String anyIp = null;
        try {
            Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
            for (NetworkInterface iface : Collections.list(ifaces)) {
                if (!iface.isUp() || iface.isLoopback()) continue;
                String name = iface.getName().toLowerCase();
                for (Enumeration<InetAddress> addrs = iface.getInetAddresses(); addrs.hasMoreElements(); ) {
                    InetAddress addr = addrs.nextElement();
                    if (addr.isLoopbackAddress() || addr.getHostAddress().indexOf(':') >= 0) continue;
                    boolean hotspot = false;
                    for (String h : HOTSPOT_IFACES) {
                        if (name.equals(h) || name.startsWith(h)) {
                            hotspot = true;
                            break;
                        }
                    }
                    if (hotspot) return addr.getHostAddress();
                    if (name.startsWith("wlan0") && wifiIp == null) wifiIp = addr.getHostAddress();
                    if (anyIp == null) anyIp = addr.getHostAddress();
                }
            }
        } catch (Exception ignored) {
        }
        if (wifiIp != null) return wifiIp;
        if (anyIp != null) return anyIp;
        return "192.168.43.1";
    }
}
