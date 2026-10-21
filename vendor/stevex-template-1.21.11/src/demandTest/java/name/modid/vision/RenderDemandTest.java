package name.modid.vision;

public final class RenderDemandTest {
    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        RenderDemand demand = new RenderDemand(true);
        check(demand.skipRender(true, false), "idle world should not draw");
        check(!demand.skipRender(false, false), "title screen must remain usable");
        check(!demand.skipRender(true, true), "loading screens and menus must remain usable");
        check(demand.limit(260) == 20, "idle loop must preserve ticks without busy spinning");
        try (var outer = demand.acquire()) {
            check(!demand.idle(), "request must wake renderer");
            check(!demand.skipRender(true, false), "request must draw");
            check(demand.limit(260) == 30, "request loop should be bounded");
            var nested = demand.acquire();
            nested.close();
            nested.close();
            check(!demand.idle(), "nested double-close must not release outer scope");
        }
        check(demand.idle(), "finished request must stop rendering");
        try (var failure = demand.acquire()) { throw new IllegalStateException("expected"); }
        catch (IllegalStateException expected) { check(demand.idle(), "failed request must release scope"); }
        RenderDemand normal = new RenderDemand(false);
        check(!normal.skipRender(true, false) && normal.limit(144) == 144, "normal client must be unchanged");
        System.out.println("RenderDemand lifecycle checks passed");
    }
}
