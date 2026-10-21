package com.example.memworld;

import com.google.gson.JsonObject;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtAccounter;
import net.minecraft.nbt.NbtIo;
import org.lwjgl.glfw.GLFW;

/** Opt-in smoke check; never participates in ordinary agent or debug runs. */
public final class DebugVerification {
    private final long deadline = System.nanoTime() + 180_000_000_000L;
    private final long startedAt = System.currentTimeMillis();
    private int readyTicks;
    private boolean started;
    private boolean finished;

    public void tick(Minecraft mc) {
        if (finished) return;
        if (System.nanoTime() > deadline) {
            JsonObject report = new JsonObject();
            report.addProperty("ok", false);
            report.addProperty("error", "Verification timed out");
            finish(mc, report);
            return;
        }
        if (started || mc.level == null || mc.player == null || mc.screen != null || mc.getSingleplayerServer() == null) return;
        if (++readyTicks < 200) return;
        started = true;
        JsonObject report = new JsonObject();
        long window = mc.getWindow().handle();
        report.addProperty("windowVisible", GLFW.glfwGetWindowAttrib(window, GLFW.GLFW_VISIBLE) != 0);
        report.addProperty("windowFocused", GLFW.glfwGetWindowAttrib(window, GLFW.GLFW_FOCUSED) != 0);
        report.addProperty("mouseGrabbed", mc.mouseHandler.isMouseGrabbed());
        report.addProperty("renderDistance", mc.options.renderDistance().get());
        report.addProperty("simulationDistance", mc.options.simulationDistance().get());
        report.addProperty("maxFps", mc.options.framerateLimit().get());
        var dimension = mc.level.dimension();
        var server = mc.getSingleplayerServer();
        server.execute(() -> {
            try {
                CompoundTag root = NbtIo.readCompressed(MemoryConfig.get().resolveTerrainFile(), NbtAccounter.unlimitedHeap());
                var worlds = WorldsFile.read(root);
                CompoundTag bucket = worlds.worlds().get(dimension.identifier().toString());
                if (bucket == null) throw new IllegalStateException("No terrain in the active dimension");
                CompoundTag blocks = bucket.getCompoundOrEmpty("blocks");
                int checked = 0;
                int mismatched = 0;
                for (String key : blocks.keySet()) {
                    String[] xyz = key.split(",");
                    BlockPos pos = new BlockPos(Integer.parseInt(xyz[0]), Integer.parseInt(xyz[1]), Integer.parseInt(xyz[2]));
                    CompoundTag entry = blocks.getCompoundOrEmpty(key);
                    CompoundTag stateTag = entry.getCompoundOrEmpty("state");
                    var state = new LinkedHashMap<String, String>();
                    for (String property : stateTag.keySet()) state.put(property, stateTag.getStringOr(property, ""));
                    var expected = BlockStateUtil.fromSaved(entry.getStringOr("block", ""), state);
                    if (!server.getLevel(dimension).getBlockState(pos).equals(expected)) mismatched++;
                    checked++;
                }
                report.addProperty("checkedBlocks", checked);
                report.addProperty("mismatchedBlocks", mismatched);
                report.addProperty("ok", checked > 0 && mismatched == 0 && !report.get("windowFocused").getAsBoolean()
                        && !report.get("mouseGrabbed").getAsBoolean());
            } catch (Exception e) {
                report.addProperty("ok", false);
                report.addProperty("error", e.toString());
            }
            mc.execute(() -> Screenshot.grab(mc.gameDirectory, "verification.png", mc.getMainRenderTarget(), 1,
                    message -> mc.execute(() -> finish(mc, report))));
        });
    }

    private void finish(Minecraft mc, JsonObject report) {
        if (finished) return;
        finished = true;
        try {
            boolean screenshot = Files.isRegularFile(mc.gameDirectory.toPath().resolve("screenshots/verification.png"));
            report.addProperty("screenshotSaved", screenshot);
            if (!screenshot) report.addProperty("ok", false);
            MemoryConfig config = MemoryConfig.get();
            if (!config.sourceOwnerFile.isBlank()) {
                var cells = config.resolveMemoryCellsFile();
                boolean fresh = Files.isRegularFile(cells) && Files.getLastModifiedTime(cells).toMillis() >= startedAt;
                report.addProperty("feedbackFresh", fresh);
                report.addProperty("feedbackOwnerValid", config.sourceOwnerValid());
                if (!fresh || !config.sourceOwnerValid()) report.addProperty("ok", false);
            }
            Files.writeString(mc.gameDirectory.toPath().resolve("verification.json"), report.toString());
        } catch (Exception e) {
            System.err.println("Memory verification report failed: " + e);
        }
        mc.stop();
    }
}
