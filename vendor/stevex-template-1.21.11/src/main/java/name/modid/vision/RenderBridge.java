package name.modid.vision;

import java.util.Map;
import java.util.LinkedHashMap;
import java.util.UUID;
import net.minecraft.client.Camera;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.world.entity.Entity;
import name.modid.AgentWebSocketServer;
import name.modid.AgentWebSocketServer.WsHandler;

/** One operator-controlled spectator camera, with isolated per-agent memory contexts. */
public final class RenderBridge {
    private static UUID target;
    private static String agentId;
    private static String memoryNamespace;
    private static int matchingFrames;
    private static boolean previousHideGui;
    private static boolean previousPause;
    private static CameraType previousCameraType;

    private RenderBridge() {}

    public static void register(Map<String, WsHandler> handlers) {
        handlers.put("render/bind", RenderBridge::bind);
        handlers.put("render/status", params -> status());
        handlers.put("render/capture", RenderBridge::capture);
        handlers.put("render/unbind", params -> unbind());
    }

    public static void onFrame(Camera camera) {
        RenderDemand.INSTANCE.onWorldFrame();
        if (target == null) return;
        if (camera.entity() != null && target.equals(camera.entity().getUUID()) && !camera.isDetached()) matchingFrames++;
        else matchingFrames = 0;
    }

    private static Map<String, Object> bind(Map<String, Object> params) {
        UUID uuid = UUID.fromString(String.valueOf(params.get("targetUuid")));
        String name = MemoryPaths.identifier((String) params.get("agentId"));
        String namespace = MemoryPaths.identifier((String) params.get("memoryNamespace"));
        synchronized (VisionApi.CAPTURE_LOCK) {
            Map<String, Object> result = AgentWebSocketServer.runOnClient(3000, "render bind", ref -> {
                Minecraft mc = Minecraft.getInstance();
                if (mc.player == null || mc.level == null) {
                    ref.value = Map.of("ok", false, "error", "renderer must join the same server as the Mineflayer player");
                    return;
                }
                if (!mc.player.isSpectator()) {
                    ref.value = Map.of("ok", false, "error", "renderer must be an operator in spectator mode; run /gamemode spectator for its account");
                    return;
                }
                if (uuid.equals(mc.player.getUUID())) {
                    ref.value = Map.of("ok", false, "error", "target must be a separate Mineflayer player");
                    return;
                }
                if (mc.screen != null && !(mc.screen instanceof PauseScreen)) {
                    ref.value = Map.of("ok", false, "error", "close renderer menus before switching agents");
                    return;
                }
                try {
                    MemoryPaths.select(namespace, name, uuid, mc.getCurrentServer() == null ? "singleplayer" : mc.getCurrentServer().ip);
                } catch (java.io.IOException error) {
                    ref.value = Map.of("ok", false, "error", error.getMessage());
                    return;
                }
                ContainerMemoryTracker.onMemorySwitch();
                if (target == null) {
                    previousHideGui = mc.options.hideGui;
                    previousPause = mc.options.pauseOnLostFocus;
                    previousCameraType = mc.options.getCameraType();
                }
                target = uuid;
                agentId = name;
                memoryNamespace = namespace;
                matchingFrames = 0;
                mc.options.hideGui = true;
                mc.options.pauseOnLostFocus = false;
                mc.options.setCameraType(CameraType.FIRST_PERSON);
                if (RenderDemand.INSTANCE.enabled() && mc.screen instanceof PauseScreen) mc.screen.onClose();
                mc.player.connection.sendCommand("spectate " + uuid);
                ref.value = Map.of("ok", true, "binding", true, "targetUuid", uuid.toString(), "agentId", name);
            });
            if (result == null) return Map.of("ok", false, "error", "render bind timed out");
            return result;
        }
    }

    private static Map<String, Object> status() {
        Map<String, Object> result = AgentWebSocketServer.runOnClient(3000, "render status", ref -> {
            Minecraft mc = Minecraft.getInstance();
            Entity camera = mc.getCameraEntity();
            boolean ready = target != null && mc.player != null && mc.level != null
                    && mc.player.isSpectator() && camera != null && target.equals(camera.getUUID())
                    && mc.options.getCameraType().isFirstPerson() && mc.screen == null
                    && mc.level.hasChunkAt(camera.blockPosition()) && matchingFrames >= 20;
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("ok", true);
            data.put("ready", ready);
            data.put("targetUuid", target == null ? null : target.toString());
            data.put("agentId", agentId);
            data.put("memoryNamespace", memoryNamespace);
            data.put("memoryDirectory", target == null ? null : MemoryPaths.directory().toString());
            data.put("cameraUuid", camera == null ? null : camera.getUUID().toString());
            data.put("targetLoaded", target != null && mc.level != null && mc.level.getPlayerByUUID(target) != null);
            data.put("matchingFrames", matchingFrames);
            data.put("spectator", mc.player != null && mc.player.isSpectator());
            data.put("screenOpen", mc.screen != null);
            data.put("screenType", mc.screen == null ? null : mc.screen.getClass().getSimpleName());
            data.put("rendering", RenderDemand.INSTANCE.status());
            long window = mc.getWindow().handle();
            data.put("windowVisible", org.lwjgl.glfw.GLFW.glfwGetWindowAttrib(window, org.lwjgl.glfw.GLFW.GLFW_VISIBLE) != 0);
            data.put("windowFocused", org.lwjgl.glfw.GLFW.glfwGetWindowAttrib(window, org.lwjgl.glfw.GLFW.GLFW_FOCUSED) != 0);
            data.put("mouseGrabbed", mc.mouseHandler.isMouseGrabbed());
            ref.value = data;
        });
        return result == null ? Map.of("ok", false, "error", "render status timed out") : result;
    }

    private static Map<String, Object> capture(Map<String, Object> params) {
        synchronized (VisionApi.CAPTURE_LOCK) {
            if (target == null || !target.toString().equals(params.get("targetUuid"))
                    || !agentId.equals(params.get("agentId")) || !memoryNamespace.equals(params.get("memoryNamespace"))) {
                return Map.of("ok", false, "error", "capture identity differs from the selected camera/memory context");
            }
            try (var demand = RenderDemand.INSTANCE.acquire()) {
                Map<String, Object> reset = AgentWebSocketServer.runOnClient(3000, "render warmup", ref -> {
                    matchingFrames = 0;
                    ref.value = Map.of("ok", true);
                });
                if (reset == null) return Map.of("ok", false, "error", "render warmup timed out");
                long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(15);
                long nextRepair = System.nanoTime() + java.util.concurrent.TimeUnit.MILLISECONDS.toNanos(500);
                Map<String, Object> state = status();
                while (!Boolean.TRUE.equals(state.get("ready"))) {
                    if (Boolean.TRUE.equals(state.get("screenOpen")) || !Boolean.TRUE.equals(state.get("spectator"))
                            || state.get("targetUuid") == null || !Boolean.TRUE.equals(state.get("ok"))
                            || System.nanoTime() >= deadline) {
                        return Map.of("ok", false, "error", "camera not ready: check menus, spectator/operator permissions and target loading", "state", state);
                    }
                    // A far-away player's camera packet can arrive before its spawn packet.
                    if (Boolean.TRUE.equals(state.get("targetLoaded")) && !target.toString().equals(state.get("cameraUuid"))
                            && System.nanoTime() >= nextRepair) {
                        AgentWebSocketServer.runOnClient(3000, "repair spectator camera", ref -> {
                            Minecraft mc = Minecraft.getInstance();
                            if (mc.player != null && mc.player.isSpectator()) {
                                mc.player.connection.sendCommand("spectate");
                                mc.player.connection.sendCommand("spectate " + target);
                            }
                            ref.value = Map.of("ok", true);
                        });
                        nextRepair = System.nanoTime() + java.util.concurrent.TimeUnit.MILLISECONDS.toNanos(500);
                    }
                    try { Thread.sleep(100); }
                    catch (InterruptedException error) {
                        Thread.currentThread().interrupt();
                        return Map.of("ok", false, "error", "render warmup interrupted");
                    }
                    state = status();
                }
                Map<String, Object> frame = VisionApi.capture(true);
                if (!Boolean.TRUE.equals(frame.get("ok"))) return frame;
                if (!target.toString().equals(frame.get("cameraUuid"))) {
                    return Map.of("ok", false, "error", "camera changed during capture; discard frame");
                }
                frame.put("frameId", UUID.randomUUID().toString());
                frame.put("agentId", agentId);
                frame.put("memoryNamespace", memoryNamespace);
                frame.put("memoryDirectory", MemoryPaths.directory().toString());
                frame.put("targetUuid", target.toString());
                frame.put("includeHud", false);
                frame.put("synchronization", "server-spectator-camera; client-interpolated; not server-tick-locked");
                return frame;
            }
        }
    }

    private static Map<String, Object> unbind() {
        synchronized (VisionApi.CAPTURE_LOCK) {
            Map<String, Object> result = AgentWebSocketServer.runOnClient(3000, "render unbind", ref -> {
                Minecraft mc = Minecraft.getInstance();
                if (target != null) {
                    if (mc.player != null) mc.player.connection.sendCommand("spectate");
                    mc.options.hideGui = previousHideGui;
                    mc.options.pauseOnLostFocus = previousPause;
                    mc.options.setCameraType(previousCameraType);
                }
                target = null;
                agentId = null;
                memoryNamespace = null;
                ContainerMemoryTracker.onMemorySwitch();
                MemoryPaths.clearSelection();
                matchingFrames = 0;
                ref.value = Map.of("ok", true);
            });
            return result == null ? Map.of("ok", false, "error", "render unbind timed out") : result;
        }
    }
}
