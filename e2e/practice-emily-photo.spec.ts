import { test, expect } from "@playwright/test";
import { resetStorage } from "./fixtures";

/**
 * Regression coverage for a real bug (2026-08-06): EmilyAvatar's
 * `h-[92%]` on the emily-practice.png <img> was a percentage height with
 * no definite-height ancestor to resolve against (the wrapping
 * `.emily-avatar` div used `bottom-0` with no `top`/explicit height, so
 * its own height was 'auto' — computed *from* its child, not given *to*
 * it). Per the CSS spec a percentage height against an 'auto' containing
 * block resolves to 'auto', so the browser fell back to the image's
 * intrinsic 1254x1254 size instead of scaling it down — Emily's photo
 * rendered ~5x taller than its frame and was pushed almost entirely
 * outside the visible, `overflow-hidden`-clipped composite, making her
 * effectively invisible.
 *
 * This asserts the actual observable symptom: the photo's rendered
 * bounding box must fit inside the frame that's supposed to contain it,
 * not just "exists in the DOM" (which was already true before the fix).
 */
test.describe("Practice page — Emily photo composite", () => {
  test("Emily's photo is scaled to fit inside its room-photo frame, not rendered at native size", async ({
    page,
  }) => {
    await resetStorage(page);
    await page.goto("/practice?debug=1");

    const frame = page.getByTestId("emily-avatar-wrapper").locator("> div").first();
    const photo = page.getByTestId("emily-avatar").locator("img");

    await expect(photo).toBeVisible();

    const frameBox = await frame.boundingBox();
    const photoBox = await photo.boundingBox();
    expect(frameBox).not.toBeNull();
    expect(photoBox).not.toBeNull();

    // The photo must be scaled down to (roughly) fit its frame — not
    // rendered at its native 1254px intrinsic height inside a ~240px frame.
    expect(photoBox!.height).toBeLessThanOrEqual(frameBox!.height + 1);

    // And it must actually sit inside the frame's visible bounds, not be
    // pushed up above/below it by an auto-height ancestor.
    expect(photoBox!.y).toBeGreaterThanOrEqual(frameBox!.y - 1);
    expect(photoBox!.y + photoBox!.height).toBeLessThanOrEqual(frameBox!.y + frameBox!.height + 1);
  });
});
