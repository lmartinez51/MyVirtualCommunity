using System.Collections.Generic;
using UnityEngine;

namespace MyVirtualCommunity.Environment
{
    /// <summary>
    /// Manages live physical substance visuals shared by Player and NPCs (Camila):
    /// - Pothole water level & progressive sand/earth patching flush with street asphalt
    /// - Colorful 3D chalk drawings on the blank wall
    /// - Ground water splashes and dumped sand mounds
    /// - Trash bag disposal inside the wheeled trash bin
    /// </summary>
    public class WorldSubstanceController : MonoBehaviour
    {
        public static WorldSubstanceController Instance { get; private set; }

        private Transform potholeRoot;
        private Transform potholeWaterSurface;
        private Transform potholeSandFill;
        private Collider potholePatchCollider;
        private Transform blankWallTransform;

        private float potholeWaterLevel = 1.0f;
        private float potholeSandFillLevel = 0.0f;
        private int blankWallChalkMarks = 0;

        private readonly List<GameObject> dynamicGroundEffects = new List<GameObject>();
        private readonly List<GameObject> chalkMarkObjects = new List<GameObject>();

        public float PotholeWaterLevel => potholeWaterLevel;
        public float PotholeSandFillLevel => potholeSandFillLevel;
        public int BlankWallChalkMarks => blankWallChalkMarks;

        private void Awake()
        {
            Instance = this;
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        public void RegisterPothole(Transform root, Transform waterSurface, Transform sandFill, Collider patchCollider)
        {
            potholeRoot = root;
            potholeWaterSurface = waterSurface;
            potholeSandFill = sandFill;
            potholePatchCollider = patchCollider;
            ApplyPotholeVisuals();
        }

        public void RegisterBlankWall(Transform blankWall)
        {
            blankWallTransform = blankWall;
        }

        public void SetPotholeState(float waterLevel, float sandFillLevel)
        {
            potholeWaterLevel = Mathf.Clamp01(waterLevel);
            potholeSandFillLevel = Mathf.Clamp01(sandFillLevel);
            ApplyPotholeVisuals();
        }

        public void ScoopWaterFromPothole(float amount = 0.25f)
        {
            SetPotholeState(potholeWaterLevel - amount, potholeSandFillLevel);
        }

        public void AddWaterToPothole(float amount = 0.25f)
        {
            SetPotholeState(potholeWaterLevel + amount, potholeSandFillLevel);
        }

        public void AddSandToPothole(float amount = 0.34f)
        {
            SetPotholeState(potholeWaterLevel - 0.35f, potholeSandFillLevel + amount);
        }

        private void ApplyPotholeVisuals()
        {
            if (potholeWaterSurface != null)
            {
                bool showWater = potholeWaterLevel > 0.04f && potholeSandFillLevel < 0.92f;
                potholeWaterSurface.gameObject.SetActive(showWater);
                if (showWater)
                {
                    // Water level lowers cleanly inside the 9.5cm recessed pothole as scoops are removed
                    float waterY = Mathf.Lerp(-0.088f, -0.042f, potholeWaterLevel);
                    float scaleXZ = Mathf.Lerp(0.68f, 1.0f, potholeWaterLevel);
                    potholeWaterSurface.localPosition = new Vector3(0f, waterY, 0f);
                    potholeWaterSurface.localScale = new Vector3(1.42f * scaleXZ, 0.008f, 1.12f * scaleXZ);
                }
            }

            if (potholeSandFill != null)
            {
                bool showSand = potholeSandFillLevel > 0.02f;
                potholeSandFill.gameObject.SetActive(showSand);
                if (showSand)
                {
                    // Compacted earth/sand rises smoothly from crater floor (-0.095m) up to street level (+0.002m)
                    float thickness = Mathf.Lerp(0.025f, 0.098f, potholeSandFillLevel);
                    float centerY = -0.095f + thickness * 0.5f;
                    potholeSandFill.localPosition = new Vector3(0f, centerY, 0f);
                    potholeSandFill.localScale = new Vector3(1.46f, thickness, 1.16f);
                }
            }

            if (potholePatchCollider != null)
            {
                // Once >= 90% filled with earth/sand, pothole becomes flush walkable ground!
                potholePatchCollider.enabled = potholeSandFillLevel >= 0.90f;
            }
        }

        public void SpawnWaterSplash(Vector3 worldPos)
        {
            Vector3 grounded = GroundPosition(worldPos);
            GameObject splash = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            splash.name = $"Poured_Water_Splash_{dynamicGroundEffects.Count}";
            splash.transform.SetParent(transform, true);
            splash.transform.position = new Vector3(grounded.x, grounded.y + 0.005f, grounded.z);
            splash.transform.localScale = new Vector3(0.75f, 0.004f, 0.75f);
            var col = splash.GetComponent<Collider>();
            if (col != null) Destroy(col);
            ApplySimpleColor(splash, new Color(0.20f, 0.46f, 0.68f), 0.92f);
            RegisterGroundEffect(splash);
        }

        public void SpawnSandMound(Vector3 worldPos)
        {
            Vector3 grounded = GroundPosition(worldPos);
            GameObject mound = new GameObject($"Dumped_Sand_Mound_{dynamicGroundEffects.Count}");
            mound.transform.SetParent(transform, true);
            mound.transform.position = grounded;

            Color sandMain = new Color(0.76f, 0.64f, 0.44f);
            Color sandDark = new Color(0.64f, 0.52f, 0.34f);

            GameObject baseDisc = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            baseDisc.transform.SetParent(mound.transform, false);
            baseDisc.transform.localPosition = new Vector3(0f, 0.03f, 0f);
            baseDisc.transform.localScale = new Vector3(0.56f, 0.03f, 0.52f);
            Destroy(baseDisc.GetComponent<Collider>());
            ApplySimpleColor(baseDisc, sandDark, 0.12f);

            GameObject dome = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            dome.transform.SetParent(mound.transform, false);
            dome.transform.localPosition = new Vector3(0f, 0.05f, 0f);
            dome.transform.localScale = new Vector3(0.46f, 0.16f, 0.44f);
            Destroy(dome.GetComponent<Collider>());
            ApplySimpleColor(dome, sandMain, 0.10f);

            RegisterGroundEffect(mound);
        }

        public void AddChalkDrawing()
        {
            blankWallChalkMarks += 1;
            if (blankWallTransform == null)
            {
                var found = GameObject.Find("Probe_BlankWall");
                if (found != null) blankWallTransform = found.transform;
            }
            if (blankWallTransform == null) return;

            Color[] palette = new Color[]
            {
                new Color(0.96f, 0.32f, 0.54f),
                new Color(0.98f, 0.82f, 0.22f),
                new Color(0.24f, 0.78f, 0.92f),
                new Color(0.42f, 0.88f, 0.42f),
                new Color(0.76f, 0.44f, 0.96f),
            };
            Color c = palette[(blankWallChalkMarks - 1) % palette.Length];

            // Probe_BlankWall is at (-2.5, 1.24, 8), size (0.15, 2.0, 3.0) — draw on its visible west face (-X)
            int idx = (blankWallChalkMarks - 1) % 6;
            float offsetZ = -0.95f + (idx % 3) * 0.95f;
            float offsetY = (idx < 3) ? 0.28f : -0.25f;

            GameObject doodle = new GameObject($"Chalk_Art_{blankWallChalkMarks}");
            doodle.transform.SetParent(transform, true);
            Vector3 wallCenter = blankWallTransform.position;
            doodle.transform.position = new Vector3(wallCenter.x - 0.085f, wallCenter.y + offsetY, wallCenter.z + offsetZ);

            // Create a playful colorful chalk sunburst / geometric swirl cluster (4 intersecting strokes)
            for (int s = 0; s < 4; s++)
            {
                GameObject stroke = GameObject.CreatePrimitive(PrimitiveType.Cube);
                stroke.transform.SetParent(doodle.transform, false);
                stroke.transform.localPosition = new Vector3(0f, 0f, 0f);
                stroke.transform.localEulerAngles = new Vector3(s * 45f, 0f, 0f);
                stroke.transform.localScale = new Vector3(0.012f, 0.44f, 0.045f);
                Destroy(stroke.GetComponent<Collider>());
                ApplySimpleColor(stroke, c, 0.08f);
            }

            GameObject centerDot = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            centerDot.transform.SetParent(doodle.transform, false);
            centerDot.transform.localPosition = Vector3.zero;
            centerDot.transform.localScale = new Vector3(0.02f, 0.14f, 0.14f);
            Destroy(centerDot.GetComponent<Collider>());
            ApplySimpleColor(centerDot, Color.white, 0.08f);

            chalkMarkObjects.Add(doodle);
        }

        public void SpawnChalkMarkOnSurface(Vector3 worldPos)
        {
            blankWallChalkMarks += 1;
            Color[] palette = new Color[]
            {
                new Color(0.96f, 0.32f, 0.54f),
                new Color(0.98f, 0.82f, 0.22f),
                new Color(0.24f, 0.78f, 0.92f),
                new Color(0.42f, 0.88f, 0.42f),
            };
            Color c = palette[(blankWallChalkMarks - 1) % palette.Length];

            Vector3 surfacePos = GroundPosition(worldPos);
            // If marking right near the bench, place the mark cleanly on top of the bench seat (Y = 0.695m)
            GameObject bench = GameObject.Find("Probe_Bench");
            if (bench != null && Vector2.Distance(new Vector2(worldPos.x, worldPos.z), new Vector2(bench.transform.position.x, bench.transform.position.z)) <= 1.25f)
            {
                surfacePos = new Vector3(bench.transform.position.x + Random.Range(-0.45f, 0.45f), bench.transform.position.y + 0.455f, bench.transform.position.z);
            }
            else
            {
                surfacePos.y += 0.008f;
            }

            GameObject mark = new GameObject($"Chalk_Surface_Mark_{blankWallChalkMarks}");
            mark.transform.SetParent(transform, true);
            mark.transform.position = surfacePos;

            for (int s = 0; s < 3; s++)
            {
                GameObject stroke = GameObject.CreatePrimitive(PrimitiveType.Cube);
                stroke.transform.SetParent(mark.transform, false);
                stroke.transform.localPosition = Vector3.zero;
                stroke.transform.localEulerAngles = new Vector3(0f, s * 60f, 0f);
                stroke.transform.localScale = new Vector3(0.26f, 0.008f, 0.036f);
                Destroy(stroke.GetComponent<Collider>());
                ApplySimpleColor(stroke, c, 0.08f);
            }

            RegisterGroundEffect(mark);
        }

        public void DisposeTrashBagInBin(GameObject bagObj, GameObject binObj)
        {
            if (bagObj == null || binObj == null) return;
            var prop = bagObj.GetComponent<InteractiveWorldProp>();
            if (prop != null && prop.IsHeld)
            {
                prop.Drop(binObj.transform);
            }

            var rb = bagObj.GetComponent<Rigidbody>();
            if (rb != null)
            {
                rb.linearVelocity = Vector3.zero;
                rb.angularVelocity = Vector3.zero;
                rb.isKinematic = true;
            }

            // Tuck the tied bag cleanly inside the wheeled trash bin interior
            bagObj.transform.SetParent(binObj.transform, true);
            bagObj.transform.localPosition = new Vector3(0f, 0.46f, 0f);
            bagObj.transform.localScale = Vector3.one * 0.72f;
            var cols = bagObj.GetComponentsInChildren<Collider>(true);
            for (int i = 0; i < cols.Length; i++)
            {
                if (cols[i] != null) cols[i].enabled = false;
            }
        }

        private void RegisterGroundEffect(GameObject obj)
        {
            dynamicGroundEffects.Add(obj);
            if (dynamicGroundEffects.Count > 24)
            {
                var oldest = dynamicGroundEffects[0];
                dynamicGroundEffects.RemoveAt(0);
                if (oldest != null) Destroy(oldest);
            }
        }

        private static Vector3 GroundPosition(Vector3 pos)
        {
            RaycastHit[] hits = Physics.RaycastAll(new Vector3(pos.x, pos.y + 1.5f, pos.z), Vector3.down, 4.5f, ~(1 << 2), QueryTriggerInteraction.Ignore);
            float bestY = pos.y;
            bool found = false;
            for (int i = 0; i < hits.Length; i++)
            {
                if (hits[i].collider == null) continue;
                if (hits[i].collider.GetComponentInParent<InteractiveWorldProp>() != null) continue;
                if (!found || hits[i].point.y > bestY)
                {
                    bestY = hits[i].point.y;
                    found = true;
                }
            }
            return new Vector3(pos.x, found ? bestY : pos.y, pos.z);
        }

        private static void ApplySimpleColor(GameObject go, Color color, float smoothness)
        {
            var rend = go.GetComponent<Renderer>();
            if (rend == null) return;
            Material mat = new Material(rend.sharedMaterial);
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", smoothness);
            if (mat.HasProperty("_Glossiness")) mat.SetFloat("_Glossiness", smoothness);
            rend.sharedMaterial = mat;
        }
    }
}
