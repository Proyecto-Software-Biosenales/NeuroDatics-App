import assert from "node:assert/strict"
import test from "node:test"
import {
  containedImageBoxStyle,
  getContainedImageBox,
  imagePointToContainerPercent,
} from "../components/stimulusGeometry.ts"

/**
 * The heatmap PNG used to be laid out with `object-contain` against the
 * container, which sizes it from its own intrinsic aspect ratio. On any
 * stimulus whose aspect ratio differed from the overlay's, the two ended up in
 * different visible boxes and every hotspot drifted. These pin the overlay box
 * to the stimulus box for square, 16:9 and ultrawide stimuli.
 */

const image = (naturalWidth, naturalHeight) => ({ naturalWidth, naturalHeight })
const container = (clientWidth, clientHeight) => ({ clientWidth, clientHeight })

const px = (value) => `${value}px`
const near = (actual, expected, tolerance = 0.01) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  )

test("a stimulus wider than its container letterboxes top and bottom", () => {
  const box = getContainedImageBox(image(3440, 1440), container(1000, 1000))

  near(box.renderedW, 1000)
  near(box.renderedH, 418.6, 0.1)
  near(box.offsetX, 0)
  near(box.offsetY, 290.7, 0.1)
})

test("a stimulus taller than its container letterboxes left and right", () => {
  const box = getContainedImageBox(image(1080, 1920), container(1000, 500))

  near(box.renderedH, 500)
  near(box.renderedW, 281.25)
  near(box.offsetY, 0)
  near(box.offsetX, 359.375)
})

test("an unmeasured image or container yields no box", () => {
  assert.equal(getContainedImageBox(null, container(800, 600)), null)
  assert.equal(getContainedImageBox(image(800, 600), null), null)
  assert.equal(getContainedImageBox(image(0, 0), container(800, 600)), null)
  assert.equal(getContainedImageBox(image(800, 600), container(0, 0)), null)
})

test("the overlay style covers exactly the painted stimulus box", () => {
  for (const [width, height] of [
    [800, 800],
    [1920, 1080],
    [3440, 1440],
  ]) {
    const box = getContainedImageBox(image(width, height), container(1200, 700))
    const style = containedImageBoxStyle(box)

    assert.equal(style.position, "absolute")
    assert.equal(style.left, px(box.offsetX))
    assert.equal(style.top, px(box.offsetY))
    assert.equal(style.width, px(box.renderedW))
    assert.equal(style.height, px(box.renderedH))
  }
})

test("the overlay box matches the stimulus box whatever the overlay's own aspect ratio", () => {
  // The stimulus is square, the overlay PNG is 16:9. Pinning to the measured
  // box makes the two occupy the same rectangle; `object-contain` would not.
  const stimulusBox = getContainedImageBox(image(800, 800), container(1200, 700))
  const overlayStyle = containedImageBoxStyle(stimulusBox)
  const objectContainOverlayBox = getContainedImageBox(
    image(1920, 1080),
    container(1200, 700)
  )

  assert.equal(overlayStyle.width, px(stimulusBox.renderedW))
  assert.equal(overlayStyle.height, px(stimulusBox.renderedH))
  assert.notEqual(objectContainOverlayBox.renderedW, stimulusBox.renderedW)
})

test("a point 20 percent down the stimulus stays 20 percent down the stimulus", () => {
  for (const [width, height] of [
    [800, 800],
    [1920, 1080],
    [3440, 1440],
  ]) {
    const box = getContainedImageBox(image(width, height), container(1200, 700))
    const point = imagePointToContainerPercent(box, 50, 20)

    const yWithinStimulus =
      ((point.y / 100) * box.cH - box.offsetY) / box.renderedH
    const xWithinStimulus =
      ((point.x / 100) * box.cW - box.offsetX) / box.renderedW

    assert.ok(Math.abs(yWithinStimulus - 0.2) < 1e-9)
    assert.ok(Math.abs(xWithinStimulus - 0.5) < 1e-9)
  }
})
