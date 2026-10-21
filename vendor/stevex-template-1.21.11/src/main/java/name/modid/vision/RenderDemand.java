package name.modid.vision;

import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/** Request scopes keep rendering awake; client ticks continue outside these scopes. */
public final class RenderDemand {
    public static final RenderDemand INSTANCE = new RenderDemand(Boolean.getBoolean("stevex.render.onDemand"));
    private final boolean enabled;
    private final AtomicInteger requests = new AtomicInteger();
    private final AtomicLong skipped = new AtomicLong();
    private final AtomicLong worldFrames = new AtomicLong();

    public RenderDemand(boolean enabled) { this.enabled = enabled; }

    public final class Scope implements AutoCloseable {
        private final AtomicBoolean closed = new AtomicBoolean();
        private Scope() { requests.incrementAndGet(); }
        @Override public void close() {
            if (closed.compareAndSet(false, true)) requests.decrementAndGet();
        }
    }

    public Scope acquire() { return new Scope(); }
    public boolean enabled() { return enabled; }
    public boolean idle() { return enabled && requests.get() == 0; }

    public boolean skipRender(boolean inWorld, boolean interfaceOpen) {
        if (!idle() || !inWorld || interfaceOpen) return false;
        skipped.incrementAndGet();
        return true;
    }

    public int limit(int vanillaLimit) {
        if (!enabled) return vanillaLimit;
        // Keep packet processing and 20 Hz client simulation responsive even while idle.
        return idle() ? 20 : 30;
    }

    public void onWorldFrame() { worldFrames.incrementAndGet(); }

    public Map<String, Object> status() {
        return Map.of("onDemand", enabled, "idle", idle(), "activeRequests", requests.get(),
                "skippedRenderCalls", skipped.get(), "worldFrames", worldFrames.get(),
                "loopLimit", enabled ? limit(30) : -1);
    }
}
