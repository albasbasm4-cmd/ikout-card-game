package com.ikout.cardgame.ws;

import android.net.wifi.WifiManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Enumeration;
import java.util.Locale;
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
    private static final String[] HOTSPOT_IFACES = { "swlan", "ap", "softap", "wlan1", "wlan2", "rndis" };
    private static final long PING_INTERVAL_SECONDS = 15;

    private WsServer server;
    private final Map<String, WsSocket> clients = new ConcurrentHashMap<>();
    private final AtomicInteger nextId = new AtomicInteger(1);
    private ScheduledExecutorService pinger;

    private synchronized ScheduledExecutorService getPinger() {
        if (pinger == null || pinger.isShutdown()) {
            pinger = Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "wss-pinger");
                t.setDaemon(true);
                return t;
            });
        }
        return pinger;
    }

    private class WsSocket extends NanoWSD.WebSocket {
        final String id;
        final ScheduledFuture<?> pingTask;

        WsSocket(NanoHTTPD.IHTTPSession handshake, String id) {
            super(handshake);
            this.id = id;
            this.pingTask = getPinger().scheduleAtFixedRate(
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
    public synchronized void start(PluginCall call) {
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
    public synchronized void stop(PluginCall call) {
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
        if (pinger != null && !pinger.isShutdown()) {
            pinger.shutdownNow();
            pinger = null;
        }
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
        // المصدر الأول: بوابة الشبكة الفعلية من LinkProperties (موثوق على أندرويد حديث)
        try {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getContext()
                .getApplicationContext()
                .getSystemService(android.content.Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                android.net.Network network = cm.getActiveNetwork();
                if (network != null) {
                    android.net.LinkProperties lp = cm.getLinkProperties(network);
                    if (lp != null) {
                        for (android.net.RouteInfo route : lp.getRoutes()) {
                            if (route.isDefaultRoute()
                                && route.getGateway() instanceof Inet4Address) {
                                InetAddress gw = route.getGateway();
                                if (isValidLocalIpv4(gw)) {
                                    ip = gw.getHostAddress();
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }
        // احتياط: DhcpInfo (غير موثوق دائماً على أندرويد حديث)
        if (ip == null) {
            try {
                WifiManager wifi = (WifiManager) getContext().getApplicationContext()
                    .getSystemService(android.content.Context.WIFI_SERVICE);
                if (wifi != null) {
                    android.net.DhcpInfo dhcp = wifi.getDhcpInfo();
                    if (dhcp != null && dhcp.gateway != 0) {
                        String candidate = intToIp(dhcp.gateway);
                        if (isIpv4StringValid(candidate)) {
                            ip = candidate;
                        }
                    }
                }
            } catch (Exception ignored) {
            }
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

    private static boolean isValidLocalIpv4(InetAddress addr) {
        if (!(addr instanceof Inet4Address)) return false;
        if (addr.isLoopbackAddress() || addr.isAnyLocalAddress()) return false;
        String host = addr.getHostAddress();
        if (host == null || host.startsWith("127.") || host.equals("0.0.0.0")) return false;
        return addr.isSiteLocalAddress() || host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172.");
    }

    private static boolean isIpv4StringValid(String host) {
        if (host == null || host.isEmpty() || host.startsWith("127.") || host.equals("0.0.0.0")) return false;
        return host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172.");
    }

    private static String detectHostIp() {
        String hotspotIp = null;
        String wifiIp = null;
        String ethIp = null;
        String otherValidIp = null;

        try {
            Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
            for (NetworkInterface iface : Collections.list(ifaces)) {
                if (!iface.isUp() || iface.isLoopback()) continue;
                String name = iface.getName().toLowerCase(Locale.ROOT);

                // استبعاد واجهات VPN والشبكات الخلوية والافتراضية
                if (name.contains("tun") || name.contains("ppp") || name.contains("tap")
                        || name.contains("dummy") || name.contains("rmnet") || name.contains("ccmni")
                        || name.contains("pdp") || name.contains("docker") || name.contains("veth")) {
                    continue;
                }

                for (Enumeration<InetAddress> addrs = iface.getInetAddresses(); addrs.hasMoreElements(); ) {
                    InetAddress addr = addrs.nextElement();
                    if (!isValidLocalIpv4(addr)) continue;
                    String ipStr = addr.getHostAddress();

                    boolean isHotspot = false;
                    for (String h : HOTSPOT_IFACES) {
                        if (name.equals(h) || name.startsWith(h)) {
                            isHotspot = true;
                            break;
                        }
                    }

                    if (isHotspot && hotspotIp == null) {
                        hotspotIp = ipStr;
                    } else if ((name.startsWith("wlan") || name.startsWith("wifi")) && wifiIp == null) {
                        wifiIp = ipStr;
                    } else if (name.startsWith("eth") && ethIp == null) {
                        ethIp = ipStr;
                    } else if (otherValidIp == null) {
                        otherValidIp = ipStr;
                    }
                }
            }
        } catch (Exception ignored) {
        }

        if (hotspotIp != null) return hotspotIp;
        if (wifiIp != null) return wifiIp;
        if (ethIp != null) return ethIp;
        if (otherValidIp != null) return otherValidIp;

        // لا نعيد أي عنوان وهمي أو غير متحقق منه
        return null;
    }
}
