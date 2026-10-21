package name.modid.mixin;

import com.mojang.blaze3d.platform.FramerateLimitTracker;
import name.modid.vision.RenderDemand;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(FramerateLimitTracker.class)
public abstract class DemandFramerateMixin {
    @Inject(method = "getFramerateLimit", at = @At("HEAD"), cancellable = true)
    private void demandLimit(CallbackInfoReturnable<Integer> cir) {
        if (RenderDemand.INSTANCE.enabled()) cir.setReturnValue(RenderDemand.INSTANCE.limit(30));
    }
}
