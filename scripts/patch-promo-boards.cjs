const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'unity-client', 'Assets', 'Scripts', 'Environment', 'GomezMorinSceneBuilder.cs');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Find section between "// 1. CHALKBOARD 1 (LEFT): LUNES & MARTES SPECIALS" and "// 3. MANDATORY CONTRACT PANEL"
const markerStart = "// 1. CHALKBOARD 1 (LEFT): LUNES & MARTES SPECIALS";
const markerEnd = "// 3. MANDATORY CONTRACT PANEL FOR Milestone 99 AUDIT:";

const idxStart = content.indexOf(markerStart);
const idxEnd = content.indexOf(markerEnd);

if (idxStart === -1 || idxEnd === -1) {
  console.error("Could not find markers in GomezMorinSceneBuilder.cs!");
  process.exit(1);
}

const replacement = `// 1. BOARD 1: LUNES & MARTES PROMOTIONAL SPECIALS (MATCHING REAL PHOTO)
            // Dimensions: 1.65m wide x 0.72m high, low-profile horizontal aspect ratio
            // Mounted right above the pass-through window frame with minimal clearance
            // Local X: -1.115m (World X: -9.515m, spanning X in [-10.34m, -8.69m])
            // =====================================================================
            GameObject board1 = new GameObject("Chalkboard_Menu_Lunes_Martes");
            board1.transform.SetParent(boardsRoot.transform, false);
            board1.transform.localPosition = new Vector3(-1.115f, 0f, -0.015f);

            float b1W = 1.65f;
            float bH = 0.72f;
            Color darkFrame = new Color(0.10f, 0.11f, 0.13f);
            Color metalScrew = new Color(0.75f, 0.78f, 0.82f);

            // Physical backing frame
            CreateBox(board1.transform, "Board_Backing", Vector3.zero, new Vector3(b1W, bH, 0.025f), darkFrame, false, 0.2f);
            // High-resolution textured poster front face
            CreateTexturedQuad(board1.transform, "Poster_Face", new Vector3(0f, 0f, -0.016f), new Vector3(b1W, bH, 1.0f), "WingSpot_Promo_Lunes_Martes.png");

            // Corner mounting screws (washer + dome screw)
            float sOffX1 = (b1W / 2f) - 0.035f;
            float sOffY = (bH / 2f) - 0.035f;
            CreateCylinder(board1.transform, "Screw_TL", new Vector3(-sOffX1, sOffY, -0.022f), new Vector3(0.022f, 0.012f, 0.022f), metalScrew, false);
            CreateCylinder(board1.transform, "Screw_TR", new Vector3(sOffX1, sOffY, -0.022f), new Vector3(0.022f, 0.012f, 0.022f), metalScrew, false);
            CreateCylinder(board1.transform, "Screw_BL", new Vector3(-sOffX1, -sOffY, -0.022f), new Vector3(0.022f, 0.012f, 0.022f), metalScrew, false);
            CreateCylinder(board1.transform, "Screw_BR", new Vector3(sOffX1, -sOffY, -0.022f), new Vector3(0.022f, 0.012f, 0.022f), metalScrew, false);

            // =====================================================================
            // 2. BOARD 2: MIERCOLES & JUEVES PROMOTIONAL SPECIALS (MATCHING REAL PHOTO)
            // Dimensions: 1.39m wide x 0.72m high, low-profile horizontal aspect ratio
            // Terminating flush before Decorative Pillar at East with 4cm clearance
            // Local X: +0.465m (World X: -7.935m, spanning X in [-8.63m, -7.24m])
            // =====================================================================
            GameObject board2 = new GameObject("Chalkboard_Menu_Miercoles_Jueves");
            board2.transform.SetParent(boardsRoot.transform, false);
            board2.transform.localPosition = new Vector3(0.465f, 0f, -0.015f);

            float b2W = 1.39f;
            CreateBox(board2.transform, "Board_Backing", Vector3.zero, new Vector3(b2W, bH, 0.025f), darkFrame, false, 0.2f);
            CreateTexturedQuad(board2.transform, "Poster_Face", new Vector3(0f, 0f, -0.016f), new Vector3(b2W, bH, 1.0f), "WingSpot_Promo_Miercoles_Jueves.png");

            float sOffX2 = (b2W / 2f) - 0.035f;
            CreateCylinder(board2.transform, "Screw_TL", new Vector3(-sOffX2, sOffY, -0.022f), new Vector3(0.022f, 0.012f, 0.022f), metalScrew, false);
            CreateCylinder(board2.transform, "Screw_TR", new Vector3(sOffX2, sOffY, -0.022f), new Vector3(0.022f, 0.012f, 0.022f), metalScrew, false);
            CreateCylinder(board2.transform, "Screw_BL", new Vector3(-sOffX2, -sOffY, -0.022f), new Vector3(0.022f, 0.012f, 0.022f), metalScrew, false);
            CreateCylinder(board2.transform, "Screw_BR", new Vector3(sOffX2, -sOffY, -0.022f), new Vector3(0.022f, 0.012f, 0.022f), metalScrew, false);

            // =====================================================================
            `;

content = content.substring(0, idxStart) + replacement + content.substring(idxEnd);

// 2. Adjust board3 local Y from -0.95f to -0.23f
content = content.replace(
  'board3.transform.localPosition = new Vector3(1.19f, -0.95f, -0.575f);',
  'board3.transform.localPosition = new Vector3(1.19f, -0.23f, -0.575f);'
);

// 3. Adjust camObj local Y from 1.45f to 2.17f
content = content.replace(
  'camObj.transform.localPosition = new Vector3(1.10f, 1.45f, -0.05f);',
  'camObj.transform.localPosition = new Vector3(1.10f, 2.17f, -0.05f);'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully patched GomezMorinSceneBuilder.cs with new promotional posters!");
