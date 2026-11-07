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
 *  - { type: "CLIENT_MESSAGE",      clientId, data }   (data كائن JSON أو نص)
 */
@CapacitorPlugin(name = "WebSocketServer")
public class WebSocketServerPlugin extends Plugin {

    private static final String EVENT_NAME = "wsEvent";
    private static final String[] HOTSPOT_IFACES = { "swlan0", "ap0", "softap0", "wlan1", "wlan2" };
    private static final long PING_INTERVAL_SECONDS = 15;

    private WsServer server;
    private int currentPort = -1;
    private final Map<String, WsSocket> clients = new ConcurrentHashMap<>();
    private final AtomicInteger nextId = new AtomicInteger(1);
    private ScheduledExecutorService pinger;

    private synchronized ScheduledExecutorService getPinger() {
        if (pinger == null || pinger.isShutdown() || pinger.isTerminated()) {
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
        ScheduledFuture<?> pingTask;

        WsSocket(NanoHTTPD.IHTTPSession handshake, String id) {
            super(handshake);
            this.id = id;
            try {
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
            } catch (Exception e) {
                this.pingTask = null;
            }
        }

        @Override
        protected void onOpen() {
            // الاتصال أُعلن عنه مسبقاً في openWebSocket
        }

        @Override
        protected void onClose(NanoWSD.WebSocketFrame.CloseCode code, String reason, boolean initiatedByRemote) {
            cancelPing();
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
            // استجابة ping مقبولة
        }

        @Override
        protected void onException(IOException exception) {
            cancelPing();
            handleSocketClosed(id);
        }

        void cancelPing() {
            if (pingTask != null) {
                pingTask.cancel(false);
                pingTask = null;
            }
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
        int port = call.getInt("port", 8080);
        if (server != null && currentPort == port) {
            call.resolve();
            return;
        }

        // إذا كان هناك سيرفر يعمل على منفذ آخر، نقوم بإيقافه أولاً
        stopInternal();

        try {
            server = new WsServer(port);
            server.start(0, false);
            currentPort = port;
            call.resolve();
        } catch (IOException e) {
            server = null;
            currentPort = -1;
            call.reject("START_FAILED", e.getMessage());
        }
    }

    @PluginMethod
    public synchronized void stop(PluginCall call) {
        stopInternal();
        call.resolve();
    }

    private synchronized void stopInternal() {
        if (server != null) {
            try {
                server.stop();
            } catch (Exception ignored) {
            }
            server = null;
            currentPort = -1;
        }

        for (WsSocket socket : clients.values()) {
            socket.cancelPing();
            try {
                socket.close(NanoWSD.WebSocketFrame.CloseCode.NormalClosure, "server stopping", false);
            } catch (IOException ignored) {
            }
        }
        clients.clear();
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
                socket.cancelPing();
                clients.remove(clientId);
                notifyEvent("CLIENT_DISCONNECTED", clientId, null);
                call.reject("SEND_FAILED", e.getMessage());
            }
        } else {
            call.reject("CLIENT_NOT_FOUND", clientId != null ? clientId : "null");
        }
    }

    @PluginMethod
    public void broadcast(PluginCall call) {
        String message = call.getString("message");
        String msg = message == null ? "" : message;
        for (Map.Entry<String, WsSocket> entry : clients.entrySet()) {
            WsSocket socket = entry.getValue();
            if (socket.isOpen()) {
                try {
                    socket.send(msg);
                } catch (IOException e) {
                    socket.cancelPing();
                    clients.remove(entry.getKey());
                    notifyEvent("CLIENT_DISCONNECTED", entry.getKey(), null);
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
            socket.cancelPing();
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
                                && route.getGateway() instanceof java.net.Inet4Address) {
                                ip = route.getGateway().getHostAddress();
                                break;
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }
        // احتياط: DhcpInfo
        if (ip == null) {
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
        }
        JSObject res = new JSObject();
        res.put("ip", ip);
        call.resolve(res);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        stopInternal();
        synchronized (this) {
            if (pinger != null) {
                try {
                    pinger.shutdownNow();
                } catch (Exception ignored) {
                }
                pinger = null;
            }
        }
    }

    // ---- معالجة الأحداث الداخلية ----

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
            // ليست كائن JSON صالح، نمرر النص
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

    /**
     * اكتشاف عنوان IP لجهاز المضيف:
     * تمييز واجهات Hotspot و Wi-Fi الحقيقية، واستبعاد واجهات Loopback و VPN و Cell و Virtual.
     * يُرجع null إذا لم توجد واجهة شبكة محلية صالحة.
     */
    private static String detectHostIp() {
        String hotspotIp = null;
        String wifiIp = null;
        String privateLanIp = null;

        try {
            Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
            for (NetworkInterface iface : Collections.list(ifaces)) {
                if (!iface.isUp() || iface.isLoopback()) continue;

                String name = iface.getName().toLowerCase();

                // استبعاد واجهات VPN وشبكات البيانات الخلوية والواجهات الافتراضية
                if (name.startsWith("tun") || name.startsWith("tap") || name.startsWith("ppp")
                    || name.startsWith("wg") || name.startsWith("ipsec") || name.startsWith("rmnet")
                    || name.startsWith("ccmni") || name.startsWith("pdp") || name.startsWith("dummy")
                    || name.startsWith("p2p") || name.startsWith("docker")) {
                    continue;
                }

                for (Enumeration<InetAddress> addrs = iface.getInetAddresses(); addrs.hasMoreElements(); ) {
                    InetAddress addr = addrs.nextElement();
                    if (!(addr instanceof Inet4Address) || addr.isLoopbackAddress()) continue;

                    String hostAddr = addr.getHostAddress();
                    if (hostAddr == null || hostAddr.startsWith("127.")) continue;

                    // فحص هل هي واجهة نقطة اتصال Hotspot
                    boolean isHotspot = false;
                    for (String h : HOTSPOT_IFACES) {
                        if (name.equals(h) || name.startsWith(h)) {
                            isHotspot = true;
                            break;
                        }
                    }
                    if (isHotspot && hotspotIp == null) {
                        hotspotIp = hostAddr;
                    }

                    // فحص هل هي واجهة Wi-Fi عادية
                    if ((name.startsWith("wlan") || name.startsWith("eth")) && wifiIp == null) {
                        wifiIp = hostAddr;
                    }

                    // فحص هل العنوان من عناوين الشبكات المحلية القياسية (RFC 1918)
                    if (isPrivateIpv4(hostAddr) && privateLanIp == null) {
                        privateLanIp = hostAddr;
                    }
                }
            }
        } catch (Exception ignored) {
        }

        if (hotspotIp != null) return hotspotIp;
        if (wifiIp != null) return wifiIp;
        if (privateLanIp != null) return privateLanIp;
        return null;
    }

    private static boolean isPrivateIpv4(String ip) {
        if (ip == null) return false;
        return ip.startsWith("192.168.") || ip.startsWith("10.")
            || (ip.startsWith("172.") && isClassBPrivate(ip));
    }

    private static boolean isClassBPrivate(String ip) {
        try {
            String[] parts = ip.split("\\.");
            if (parts.length >= 2) {
                int second = Integer.parseInt(parts[1]);
                return second >= 16 && second <= 31;
            }
        } catch (Exception ignored) {
        }
        return false;
    }
}
