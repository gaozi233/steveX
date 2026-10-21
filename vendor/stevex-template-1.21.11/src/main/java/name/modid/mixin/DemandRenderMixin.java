package name.modid.mixin;

import name.modid.vision.RenderDemand;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(GameRenderer.class)
public abstract class DemandRenderMixin {
    @Inject(method = "render", at = @At("HEAD"), cancellable = true)
    private void skipIdleRender(DeltaTracker tracker, boolean tick, CallbackInfo ci) {
        Minecraft mc = Minecraft.getInstance();
        if (RenderDemand.INSTANCE.skipRender(mc.level != null, mc.screen != null || mc.getOverlay() != null)) ci.cancel();
    }

    @Inject(method = "renderLevel", at = @At("HEAD"), cancellable = true)
    private void skipIdleWorldBehindMenus(DeltaTracker tracker, CallbackInfo ci) {
        if (RenderDemand.INSTANCE.idle()) ci.cancel();
    }
}
