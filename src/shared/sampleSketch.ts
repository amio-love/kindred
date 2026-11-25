import { strokesToStaticSvg, validateStrokes } from './drawing'
import type { Stroke } from './types'

function sampleQuad(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  steps = 12,
): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
    const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
    pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10])
  }
  return pts
}

function sampleArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  startDeg: number,
  endDeg: number,
  steps = 14,
): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const deg = startDeg + ((endDeg - startDeg) * i) / steps
    const rad = (deg * Math.PI) / 180
    pts.push([
      Math.round((cx + Math.cos(rad) * rx) * 10) / 10,
      Math.round((cy + Math.sin(rad) * ry) * 10) / 10,
    ])
  }
  return pts
}

export const ELEVATOR_PROTOCOL_STROKES: readonly Stroke[] = [
  { color: '#D3DAE4', width: 2.5, points: [[52, 58], [116, 94], [116, 306], [52, 344]] },
  { color: '#D3DAE4', width: 2.5, points: [[116, 94], [344, 94]] },
  { color: '#D3DAE4', width: 2.5, points: [[116, 260], [344, 260]] },
  { color: '#DDE3EC', width: 3, points: [[52, 290], [116, 260]] },
  { color: '#D3DAE4', width: 2.5, points: [[74, 214], [94, 204], [94, 248], [74, 258], [74, 214]] },
  { color: '#9BA6B8', width: 4, points: [[84, 224], [84, 226]] },
  { color: '#9BA6B8', width: 4, points: [[84, 238], [84, 240]] },

  { color: '#A6B1C2', width: 2.6, points: sampleArc(282, 182, 11, 12, 0, 360, 14) },
  { color: '#A6B1C2', width: 2.6, points: sampleArc(282, 256, 20, 56, 182, 358, 14) },
  { color: '#A6B1C2', width: 2.6, points: sampleArc(324, 186, 10, 11, 0, 360, 14) },
  { color: '#A6B1C2', width: 2.6, points: sampleArc(324, 256, 18, 52, 182, 358, 14) },
  { color: '#B8C2D1', width: 2.2, points: sampleArc(302, 174, 6, 8, 220, 320, 8) },
  { color: '#B8C2D1', width: 2.2, points: sampleArc(304, 174, 10, 12, 220, 320, 8) },

  { color: '#D9E4F2', width: 24, points: [[138, 128], [228, 128]] },
  { color: '#D9E4F2', width: 22, points: [[154, 114], [212, 114]] },
  { color: '#C3D3E8', width: 16, points: [[142, 134], [224, 134]] },
  {
    color: '#4F698A',
    width: 3,
    points: [
      ...sampleArc(134, 128, 22, 18, 95, 255, 10),
      ...sampleArc(166, 108, 26, 20, 205, 345, 10),
      ...sampleArc(206, 110, 22, 18, 210, 350, 10),
      ...sampleArc(230, 128, 20, 18, 285, 450, 10),
      [134, 146],
    ],
  },
  { color: '#F4B942', width: 3.5, points: [[148, 120], [154, 120]] },
  { color: '#F4B942', width: 3.5, points: [[151, 117], [151, 123]] },
  { color: '#F4B942', width: 4, points: [[182, 105], [190, 105]] },
  { color: '#F4B942', width: 4, points: [[186, 101], [186, 109]] },
  { color: '#F4B942', width: 3.5, points: [[216, 122], [222, 122]] },
  { color: '#F4B942', width: 3.5, points: [[219, 119], [219, 125]] },

  { color: '#F8DFC8', width: 20, points: [[172, 220], [194, 220]] },
  { color: '#F8DFC8', width: 18, points: [[175, 232], [191, 232]] },
  { color: '#FFD6C9', width: 18, points: [[148, 294], [158, 326]] },
  { color: '#FFD6C9', width: 18, points: [[218, 294], [208, 326]] },
  { color: '#FF9E84', width: 14, points: [[144, 306], [152, 330]] },
  { color: '#FF9E84', width: 14, points: [[222, 306], [214, 330]] },

  { color: '#1F1D1A', width: 3.2, points: sampleArc(183, 218, 29, 34, -8, 188, 16) },
  { color: '#3E2E27', width: 3.6, points: sampleArc(183, 206, 33, 30, 185, 355, 16) },
  { color: '#3E2E27', width: 3.6, points: sampleQuad([151, 208], [144, 240], [154, 266], 10) },
  { color: '#3E2E27', width: 3.6, points: sampleQuad([215, 208], [222, 240], [212, 266], 10) },
  { color: '#3E2E27', width: 2.6, points: sampleQuad([160, 198], [176, 192], [190, 200], 8) },
  { color: '#3E2E27', width: 2.6, points: sampleQuad([186, 194], [198, 194], [207, 202], 8) },

  { color: '#1F1D1A', width: 2.6, points: sampleQuad([167, 219], [173, 224], [179, 219], 8) },
  { color: '#1F1D1A', width: 2.6, points: sampleQuad([187, 219], [193, 224], [199, 219], 8) },
  { color: '#1F1D1A', width: 2.4, points: sampleQuad([177, 235], [183, 240], [189, 235], 8) },
  { color: '#F49D8A', width: 5, points: [[164, 228], [167, 228]] },
  { color: '#F49D8A', width: 5, points: [[199, 228], [202, 228]] },

  { color: '#1F1D1A', width: 3.2, points: [[175, 252], [175, 266]] },
  { color: '#1F1D1A', width: 3.2, points: [[191, 252], [191, 266]] },
  { color: '#1F1D1A', width: 3.2, points: sampleQuad([132, 338], [134, 276], [170, 266], 12) },
  { color: '#1F1D1A', width: 3.2, points: sampleQuad([234, 338], [232, 276], [196, 266], 12) },
  { color: '#1F1D1A', width: 2.8, points: sampleQuad([170, 266], [183, 278], [196, 266], 10) },
  { color: '#1F1D1A', width: 2.8, points: [[166, 270], [171, 338]] },
  { color: '#1F1D1A', width: 2.8, points: [[200, 270], [195, 338]] },

  { color: '#FF5C35', width: 5.5, points: sampleArc(183, 210, 38, 42, 190, 350, 16) },
  { color: '#FF5C35', width: 11, points: [[146, 208], [146, 228]] },
  { color: '#FF5C35', width: 11, points: [[220, 208], [220, 228]] },
  { color: '#1F1D1A', width: 2.4, points: sampleArc(146, 218, 6.5, 13, 0, 360, 12) },
  { color: '#1F1D1A', width: 2.4, points: sampleArc(220, 218, 6.5, 13, 0, 360, 12) },
]

export function renderElevatorProtocolSvg(): string {
  const checked = validateStrokes(ELEVATOR_PROTOCOL_STROKES)
  if (!checked.ok) {
    throw new Error(`Invalid sample strokes: ${checked.error}`)
  }
  return strokesToStaticSvg(checked.strokes)
}
