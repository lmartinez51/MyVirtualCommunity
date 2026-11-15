using System.Collections.Generic;
using UnityEngine;

namespace MyVirtualCommunity.Character
{
    /// <summary>
    /// Factory for generating optimized procedural geometry tailored to the stylized Bobblehead aesthetic.
    /// Creates clean, smooth meshes with calculated vertex normals and UV coordinates.
    /// All solid meshes use clean single-sided manifold topology and axial cap normals.
    /// </summary>
    public static class BobbleheadGeometry
    {
        /// <summary>
        /// Generates the MVC_BobbleheadBase sculpted head mesh with integrated supraorbital brow ridge,
        /// subtle recessed eye sockets, zygomatic cheek contours, structured jawline, and smooth neck base transition.
        /// </summary>
        public static Mesh CreateStylizedHead(float rx = 0.33f, float ry = 0.35f, float rz = 0.31f, int latSegments = 24, int lonSegments = 32)
        {
            return CreateStylizedHead(BobbleheadFaceShape.Round, rx, ry, rz, latSegments, lonSegments);
        }

        /// <summary>
        /// Generates the MVC_BobbleheadBase sculpted head mesh tailored to the specified face shape preset (Round, Oval, or Angular).
        /// Features a structured supraorbital brow ridge, recessed orbital sockets, sculpted cheek planes, defined jawline/chin,
        /// and a closed cranial base that transitions seamlessly into the anatomical neck.
        /// </summary>
        public static Mesh CreateStylizedHead(BobbleheadFaceShape shape, float rx = 0.33f, float ry = 0.35f, float rz = 0.31f, int latSegments = 24, int lonSegments = 32)
        {
            float effRx = rx;
            float effRy = ry;
            float effRz = rz;

            if (shape == BobbleheadFaceShape.Oval)
            {
                effRx = rx * 0.93f;  // Slimmer lateral width
                effRy = ry * 1.045f; // Elongated vertical outline
                effRz = rz * 1.00f;
            }
            else if (shape == BobbleheadFaceShape.Angular)
            {
                effRx = rx * 1.02f;  // Structured jaw width
                effRy = ry * 0.985f;
                effRz = rz * 1.015f;
            }

            Mesh mesh = new Mesh { name = $"MVC_BobbleheadBase_Head_{shape}_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            for (int lat = 0; lat <= latSegments; lat++)
            {
                float v = (float)lat / latSegments;
                float theta = (v - 0.5f) * Mathf.PI; // -pi/2 (bottom pole) to +pi/2 (top pole)
                float cosTheta = Mathf.Cos(theta);
                float sinTheta = Mathf.Sin(theta);

                // Cheek & jaw contour modulation in lower face
                float cheekBulge = 1.0f;
                if (theta < 0.20f && theta > -0.75f)
                {
                    if (shape == BobbleheadFaceShape.Round)
                    {
                        cheekBulge += 0.088f * Mathf.Cos((theta + 0.26f) * Mathf.PI);
                    }
                    else if (shape == BobbleheadFaceShape.Oval)
                    {
                        cheekBulge += 0.044f * Mathf.Cos((theta + 0.26f) * Mathf.PI);
                    }
                    else if (shape == BobbleheadFaceShape.Angular)
                    {
                        cheekBulge += 0.072f * Mathf.Cos((theta + 0.22f) * Mathf.PI);
                    }
                }

                for (int lon = 0; lon <= lonSegments; lon++)
                {
                    float u = (float)lon / lonSegments;
                    float phi = u * 2f * Mathf.PI; // 0 to 2pi (+Z is phi=0/2pi, +X is phi=pi/2)
                    float cosPhi = Mathf.Cos(phi);
                    float sinPhi = Mathf.Sin(phi);

                    float cheekFactor = 1.0f + (cheekBulge - 1.0f) * Mathf.Max(0f, cosPhi);

                    // Structured mandibular jaw corner definition (strongest on Angular, subtle stylized structure on Round/Oval)
                    float jawBaseStrength = shape == BobbleheadFaceShape.Angular ? 0.055f : (shape == BobbleheadFaceShape.Round ? 0.022f : 0.015f);
                    float jawCorner = 0f;
                    if (theta > -0.68f && theta < -0.10f && cosPhi > 0.05f)
                    {
                        float latWeight = Mathf.Sin((theta + 0.68f) / 0.58f * Mathf.PI);
                        float sideWeight = Mathf.Pow(Mathf.Abs(sinPhi), 1.35f) * Mathf.Clamp01(cosPhi * 1.4f);
                        jawCorner = jawBaseStrength * latWeight * sideWeight;
                    }

                    // Supraorbital brow ridge, orbital eye socket recession, and defined chin plane on frontal face
                    float frontalReliefZ = 0f;
                    if (cosPhi > 0.30f)
                    {
                        float frontMask = Mathf.Clamp01((cosPhi - 0.30f) / 0.70f);
                        // Bold supraorbital brow ridge shelf across theta in [0.18, 0.54]
                        if (theta > 0.18f && theta < 0.54f)
                        {
                            float browT = (theta - 0.18f) / 0.36f;
                            float browArch = Mathf.Sin(browT * Mathf.PI);
                            frontalReliefZ += 0.016f * browArch * frontMask;
                        }
                        // Recessed orbital eye sockets around eye level theta in [-0.06, 0.20]
                        if (theta > -0.06f && theta < 0.20f)
                        {
                            float eyeLatT = (theta + 0.06f) / 0.26f;
                            float eyeLonDist = Mathf.Abs(Mathf.Abs(sinPhi) - 0.35f);
                            if (eyeLonDist < 0.25f)
                            {
                                float socketMask = Mathf.Sin(eyeLatT * Mathf.PI) * Mathf.Cos(eyeLonDist / 0.25f * Mathf.PI * 0.5f);
                                frontalReliefZ -= 0.009f * socketMask * frontMask;
                            }
                        }
                        // Defined chin prominence near lower front midline
                        if (theta > -0.85f && theta < -0.35f && Mathf.Abs(sinPhi) < 0.38f)
                        {
                            float chinT = (theta + 0.85f) / 0.50f;
                            float chinLon = Mathf.Cos(Mathf.Abs(sinPhi) / 0.38f * Mathf.PI * 0.5f);
                            frontalReliefZ += 0.014f * Mathf.Sin(chinT * Mathf.PI) * chinLon * frontMask;
                        }
                    }

                    float x = effRx * cosTheta * (cheekFactor + jawCorner) * sinPhi;
                    float y = effRy * sinTheta;
                    float z = effRz * cosTheta * cheekFactor * cosPhi + frontalReliefZ;

                    Vector3 pos = new Vector3(x, y, z);
                    vertices.Add(pos);

                    Vector3 norm = new Vector3(x / (effRx * effRx), y / (effRy * effRy), z / (effRz * effRz)).normalized;

                    // Coherent stylized face shading under top-down directional sun light
                    if (cosPhi > 0f && cosTheta > 0.05f)
                    {
                        float frontWeight = Mathf.Clamp01(cosPhi) * Mathf.Clamp01(cosTheta);
                        if (norm.y < 0f)
                        {
                            norm.y = Mathf.Lerp(norm.y, norm.y * 0.18f, frontWeight);
                        }
                        norm.z = Mathf.Lerp(norm.z, Mathf.Max(norm.z, 0.48f), frontWeight * 0.42f);
                        norm = norm.normalized;
                    }

                    normals.Add(norm);
                    uvs.Add(new Vector2(u, v));
                }
            }

            for (int lat = 0; lat < latSegments; lat++)
            {
                for (int lon = 0; lon < lonSegments; lon++)
                {
                    int current = lat * (lonSegments + 1) + lon;
                    int next = current + lonSegments + 1;

                    triangles.Add(current);
                    triangles.Add(current + 1);
                    triangles.Add(next);

                    triangles.Add(next);
                    triangles.Add(current + 1);
                    triangles.Add(next + 1);
                }
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a sculpted, closed anatomical neck column that embeds deeply into the skull base at the top
        /// and flares smoothly into the trapezius and collar at the bottom with zero air gap.
        /// </summary>
        public static Mesh CreateAnatomicalNeckMesh(float topRadius = 0.112f, float midRadius = 0.092f, float botRadiusX = 0.138f, float botRadiusZ = 0.122f, float height = 0.18f, int rings = 8, int segments = 20)
        {
            Mesh mesh = new Mesh { name = "MVC_BobbleheadBase_Neck_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            for (int r = 0; r <= rings; r++)
            {
                float t = (float)r / rings; // 0 = bottom (inside torso collar), 1 = top (inside skull base)
                float y = Mathf.Lerp(-height * 0.42f, height * 0.58f, t);

                float rx, rz;
                if (t < 0.50f)
                {
                    float st = Mathf.SmoothStep(0f, 1f, t / 0.50f);
                    rx = Mathf.Lerp(botRadiusX, midRadius, st);
                    rz = Mathf.Lerp(botRadiusZ, midRadius, st);
                }
                else
                {
                    float st = Mathf.SmoothStep(0f, 1f, (t - 0.50f) / 0.50f);
                    rx = Mathf.Lerp(midRadius, topRadius, st);
                    rz = Mathf.Lerp(midRadius, topRadius * 1.05f, st);
                }

                for (int s = 0; s <= segments; s++)
                {
                    float u = (float)s / segments;
                    float phi = u * 2f * Mathf.PI;
                    float sinP = Mathf.Sin(phi);
                    float cosP = Mathf.Cos(phi);

                    float x = sinP * rx;
                    float z = cosP * rz;

                    vertices.Add(new Vector3(x, y, z));
                    normals.Add(new Vector3(sinP / rx, 0.12f, cosP / rz).normalized);
                    uvs.Add(new Vector2(u, t));
                }
            }

            for (int r = 0; r < rings; r++)
            {
                for (int s = 0; s < segments; s++)
                {
                    int cur = r * (segments + 1) + s;
                    int nxt = cur + segments + 1;

                    triangles.Add(cur);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt);

                    triangles.Add(nxt);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt + 1);
                }
            }

            // Closed top cap (clockwise from +Y)
            int topCenter = vertices.Count;
            vertices.Add(new Vector3(0f, height * 0.58f, 0f));
            normals.Add(Vector3.up);
            uvs.Add(new Vector2(0.5f, 0.5f));
            int topRing = rings * (segments + 1);
            for (int s = 0; s < segments; s++)
            {
                triangles.Add(topCenter);
                triangles.Add(topRing + s);
                triangles.Add(topRing + s + 1);
            }

            // Closed bottom cap (clockwise from -Y)
            int botCenter = vertices.Count;
            vertices.Add(new Vector3(0f, -height * 0.42f, 0f));
            normals.Add(Vector3.down);
            uvs.Add(new Vector2(0.5f, 0.5f));
            for (int s = 0; s < segments; s++)
            {
                triangles.Add(botCenter);
                triangles.Add(s + 1);
                triangles.Add(s);
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a sculpted anatomical pelvis/hip block with a contoured waist, rounded hip flares,
        /// gluteal contour at the rear, and a rounded crotch/hip base that blends smoothly into the thighs.
        /// </summary>
        public static Mesh CreateAnatomicalPelvisMesh(float rxTop = 0.190f, float rzTop = 0.158f, float rxBot = 0.172f, float rzBot = 0.145f, float height = 0.18f, int rings = 8, int segments = 24)
        {
            Mesh mesh = new Mesh { name = "MVC_BobbleheadBase_Pelvis_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            float halfH = height * 0.5f;
            for (int r = 0; r <= rings; r++)
            {
                float t = (float)r / rings; // 0 = bottom hip socket plane, 1 = top waist plane
                float y = Mathf.Lerp(-halfH, halfH, t);

                // Rounded hip fullness in mid-pelvis, tapering cleanly at bottom and waist
                float hipCurve = Mathf.Sin(t * Mathf.PI) * 0.012f;
                float botDome = t < 0.20f ? Mathf.Sin((t / 0.20f) * Mathf.PI * 0.5f) : 1.0f;
                float rx = (Mathf.Lerp(rxBot, rxTop, t) + hipCurve) * Mathf.Lerp(0.76f, 1.0f, botDome);
                float rz = (Mathf.Lerp(rzBot, rzTop, t) + hipCurve * 0.85f) * Mathf.Lerp(0.76f, 1.0f, botDome);

                for (int s = 0; s <= segments; s++)
                {
                    float u = (float)s / segments;
                    float phi = u * 2f * Mathf.PI;
                    float sinP = Mathf.Sin(phi);
                    float cosP = Mathf.Cos(phi);

                    // Subtle gluteal fullness on rear (-Z, cosP < -0.2)
                    float gluteZ = (cosP < -0.2f && t > 0.15f && t < 0.85f)
                        ? -Mathf.Sin((t - 0.15f) / 0.70f * Mathf.PI) * ((-cosP - 0.2f) / 0.8f) * 0.014f
                        : 0f;

                    float x = sinP * rx;
                    float z = cosP * rz + gluteZ;

                    vertices.Add(new Vector3(x, y, z));
                    normals.Add(new Vector3(sinP / rx, (t - 0.45f) * 0.35f, cosP / rz).normalized);
                    uvs.Add(new Vector2(u, t));
                }
            }

            for (int r = 0; r < rings; r++)
            {
                for (int s = 0; s < segments; s++)
                {
                    int cur = r * (segments + 1) + s;
                    int nxt = cur + segments + 1;

                    triangles.Add(cur);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt);

                    triangles.Add(nxt);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt + 1);
                }
            }

            // Closed top cap (+Y)
            int topCenter = vertices.Count;
            vertices.Add(new Vector3(0f, halfH, 0f));
            normals.Add(Vector3.up);
            uvs.Add(new Vector2(0.5f, 0.5f));
            int topRing = rings * (segments + 1);
            for (int s = 0; s < segments; s++)
            {
                triangles.Add(topCenter);
                triangles.Add(topRing + s);
                triangles.Add(topRing + s + 1);
            }

            // Closed bottom cap (-Y)
            int botCenter = vertices.Count;
            vertices.Add(new Vector3(0f, -halfH - 0.008f, 0f));
            normals.Add(Vector3.down);
            uvs.Add(new Vector2(0.5f, 0.5f));
            for (int s = 0; s < segments; s++)
            {
                triangles.Add(botCenter);
                triangles.Add(s + 1);
                triangles.Add(s);
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Generates a convex curved disc that hugs the curved surface of the head for eyes, pupils, and cheeks.
        /// </summary>
        public static Mesh CreateCurvedDisc(float radiusX, float radiusY, float forwardBulge = 0.015f, int segments = 16)
        {
            Mesh mesh = new Mesh { name = "Bobblehead_Disc_Mesh" };
            var vertices = new List<Vector3> { new Vector3(0f, 0f, forwardBulge) }; // Center vertex
            var normals = new List<Vector3> { Vector3.forward };
            var uvs = new List<Vector2> { new Vector2(0.5f, 0.5f) };
            var triangles = new List<int>();

            for (int i = 0; i <= segments; i++)
            {
                float angle = (float)i / segments * 2f * Mathf.PI;
                float x = Mathf.Cos(angle) * radiusX;
                float y = Mathf.Sin(angle) * radiusY;
                float z = 0f; // Perimeter rests against face

                vertices.Add(new Vector3(x, y, z));
                normals.Add(Vector3.forward);
                uvs.Add(new Vector2(0.5f + Mathf.Cos(angle) * 0.5f, 0.5f + Mathf.Sin(angle) * 0.5f));
            }

            for (int i = 1; i <= segments; i++)
            {
                int next = i < segments ? i + 1 : 1;
                triangles.Add(0);
                triangles.Add(i);
                triangles.Add(next);
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a tapered cylinder/capsule for limbs, torso, or neck with separate axial normals
        /// on the end caps to prevent specular rim light artifacts and knee bands.
        /// </summary>
        public static Mesh CreateTaperedCylinder(float radiusTop, float radiusBottom, float height, int segments = 16, bool capTop = true, bool capBottom = true)
        {
            Mesh mesh = new Mesh { name = "Bobblehead_Cylinder_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            float halfHeight = height * 0.5f;

            // 1. Side wall vertices with pure outward cylinder normals
            int sideStart = vertices.Count;
            for (int i = 0; i <= segments; i++)
            {
                float u = (float)i / segments;
                float angle = u * 2f * Mathf.PI;
                float cos = Mathf.Cos(angle);
                float sin = Mathf.Sin(angle);

                Vector3 sideNormal = new Vector3(cos, (radiusBottom - radiusTop) / height, sin).normalized;

                // Top ring
                vertices.Add(new Vector3(cos * radiusTop, halfHeight, sin * radiusTop));
                normals.Add(sideNormal);
                uvs.Add(new Vector2(u, 1f));

                // Bottom ring
                vertices.Add(new Vector3(cos * radiusBottom, -halfHeight, sin * radiusBottom));
                normals.Add(sideNormal);
                uvs.Add(new Vector2(u, 0f));
            }

            for (int i = 0; i < segments; i++)
            {
                int topCur = sideStart + i * 2;
                int botCur = topCur + 1;
                int topNext = topCur + 2;
                int botNext = topCur + 3;

                triangles.Add(topCur);
                triangles.Add(botCur);
                triangles.Add(topNext);

                triangles.Add(topNext);
                triangles.Add(botCur);
                triangles.Add(botNext);
            }

            // 2. Top cap with dedicated Vector3.up normals
            if (capTop && radiusTop > 0.001f)
            {
                int topCenterIdx = vertices.Count;
                vertices.Add(new Vector3(0f, halfHeight, 0f));
                normals.Add(Vector3.up);
                uvs.Add(new Vector2(0.5f, 0.5f));

                int capRingStart = vertices.Count;
                for (int i = 0; i <= segments; i++)
                {
                    float u = (float)i / segments;
                    float angle = u * 2f * Mathf.PI;
                    float cos = Mathf.Cos(angle);
                    float sin = Mathf.Sin(angle);

                    vertices.Add(new Vector3(cos * radiusTop, halfHeight, sin * radiusTop));
                    normals.Add(Vector3.up);
                    uvs.Add(new Vector2(cos * 0.5f + 0.5f, sin * 0.5f + 0.5f));
                }

                for (int i = 0; i < segments; i++)
                {
                    triangles.Add(topCenterIdx);
                    triangles.Add(capRingStart + i + 1);
                    triangles.Add(capRingStart + i);
                }
            }

            // 3. Bottom cap with dedicated Vector3.down normals
            if (capBottom && radiusBottom > 0.001f)
            {
                int botCenterIdx = vertices.Count;
                vertices.Add(new Vector3(0f, -halfHeight, 0f));
                normals.Add(Vector3.down);
                uvs.Add(new Vector2(0.5f, 0.5f));

                int capRingStart = vertices.Count;
                for (int i = 0; i <= segments; i++)
                {
                    float u = (float)i / segments;
                    float angle = u * 2f * Mathf.PI;
                    float cos = Mathf.Cos(angle);
                    float sin = Mathf.Sin(angle);

                    vertices.Add(new Vector3(cos * radiusBottom, -halfHeight, sin * radiusBottom));
                    normals.Add(Vector3.down);
                    uvs.Add(new Vector2(cos * 0.5f + 0.5f, sin * 0.5f + 0.5f));
                }

                for (int i = 0; i < segments; i++)
                {
                    triangles.Add(botCenterIdx);
                    triangles.Add(capRingStart + i);
                    triangles.Add(capRingStart + i + 1);
                }
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a multi-ring anatomically contoured limb segment (upper arm, forearm, thigh, or calf)
        /// with natural muscle fullness and integrated closed spherical joint domes so rotations never expose flat seams.
        /// Uses x = sin(phi)*r, z = cos(phi)*r with clockwise outward winding (cur, cur+1, nxt).
        /// </summary>
        public static Mesh CreateContouredLimbMesh(float radiusTop, float radiusBottom, float height, float midBulge = 0.006f, int rings = 12, int segments = 16)
        {
            Mesh mesh = new Mesh { name = "MVC_BobbleheadBase_Limb_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            float halfH = height * 0.5f;
            float domeH = Mathf.Min(radiusTop, radiusBottom) * 0.36f;

            for (int r = 0; r <= rings; r++)
            {
                float t = (float)r / rings; // 0 = bottom, 1 = top
                float y;
                float rad;
                float ny;

                if (t < 0.14f)
                {
                    // Rounded bottom joint dome
                    float dt = t / 0.14f;
                    float angle = dt * Mathf.PI * 0.5f;
                    y = -halfH - domeH * Mathf.Cos(angle);
                    rad = radiusBottom * Mathf.Sin(angle);
                    ny = -Mathf.Cos(angle) * 0.75f;
                }
                else if (t > 0.86f)
                {
                    // Rounded top joint dome
                    float dt = (1f - t) / 0.14f;
                    float angle = dt * Mathf.PI * 0.5f;
                    y = halfH + domeH * Mathf.Cos(angle);
                    rad = radiusTop * Mathf.Sin(angle);
                    ny = Mathf.Cos(angle) * 0.75f;
                }
                else
                {
                    float bodyT = (t - 0.14f) / 0.72f;
                    y = Mathf.Lerp(-halfH, halfH, bodyT);
                    float baseR = Mathf.Lerp(radiusBottom, radiusTop, bodyT);
                    // Natural muscle contour peaking slightly above mid-segment
                    float muscle = Mathf.Sin(Mathf.Pow(bodyT, 0.85f) * Mathf.PI) * midBulge;
                    rad = baseR + muscle;
                    ny = (radiusBottom - radiusTop) / height * 0.45f;
                }

                for (int s = 0; s <= segments; s++)
                {
                    float u = (float)s / segments;
                    float phi = u * 2f * Mathf.PI;
                    float sinP = Mathf.Sin(phi);
                    float cosP = Mathf.Cos(phi);

                    float x = sinP * rad;
                    float z = cosP * rad;

                    vertices.Add(new Vector3(x, y, z));
                    Vector3 n = rad > 0.0005f ? new Vector3(sinP, ny, cosP).normalized : (t > 0.5f ? Vector3.up : Vector3.down);
                    normals.Add(n);
                    uvs.Add(new Vector2(u, t));
                }
            }

            for (int r = 0; r < rings; r++)
            {
                for (int s = 0; s < segments; s++)
                {
                    int cur = r * (segments + 1) + s;
                    int nxt = cur + segments + 1;

                    triangles.Add(cur);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt);

                    triangles.Add(nxt);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt + 1);
                }
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a rounded deltoid shoulder cap that smoothly bridges the upper arm sleeve into the torso.
        /// Uses x = sin(phi)*r, z = cos(phi)*r with clockwise outward winding.
        /// </summary>
        public static Mesh CreateSleeveCap(float radius = 0.082f, float height = 0.052f, int segments = 16)
        {
            Mesh mesh = new Mesh { name = "MVC_BobbleheadBase_SleeveCap_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var triangles = new List<int>();

            int rings = 7;
            for (int r = 0; r <= rings; r++)
            {
                float t = (float)r / rings;
                float theta = t * Mathf.PI * 0.5f; // 0 (equator) to pi/2 (top pole)
                float cosT = Mathf.Cos(theta);
                float sinT = Mathf.Sin(theta);

                float y = sinT * height;
                float rad = cosT * radius;

                for (int s = 0; s <= segments; s++)
                {
                    float u = (float)s / segments;
                    float phi = u * 2f * Mathf.PI;
                    float sinP = Mathf.Sin(phi);
                    float cosP = Mathf.Cos(phi);

                    float x = rad * sinP;
                    float z = rad * cosP;

                    Vector3 pos = new Vector3(x, y, z);
                    vertices.Add(pos);
                    normals.Add(new Vector3(sinP * cosT, Mathf.Max(0.15f, sinT), cosP * cosT).normalized);
                }
            }

            for (int r = 0; r < rings; r++)
            {
                for (int s = 0; s < segments; s++)
                {
                    int current = r * (segments + 1) + s;
                    int next = current + segments + 1;

                    triangles.Add(current);
                    triangles.Add(current + 1);
                    triangles.Add(next);

                    triangles.Add(next);
                    triangles.Add(current + 1);
                    triangles.Add(next + 1);
                }
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates an anatomically contoured streetwear jacket torso with broad deltoid shoulders,
        /// defined chest, tapered waist, and structured hem overlapping the pelvis.
        /// Both top and bottom caps use verified outward clockwise winding.
        /// </summary>
        public static Mesh CreateTorsoMesh(float rxTop = 0.255f, float rzTop = 0.185f, float rxBot = 0.200f, float rzBot = 0.165f, float height = 0.34f, int segments = 24)
        {
            Mesh mesh = new Mesh { name = "MVC_BobbleheadBase_Torso_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            int rings = 12;
            for (int r = 0; r <= rings; r++)
            {
                float t = (float)r / rings;
                float y = Mathf.Lerp(-height * 0.5f, height * 0.5f, t);

                // Smooth deltoid shoulder rounding at top (t > 0.86) so shoulders slope naturally into neck and arms
                float profileT = t < 0.86f ? Mathf.Pow(t / 0.86f, 0.85f) : Mathf.Lerp(1.0f, 0.74f, (t - 0.86f) / 0.14f);
                float rx = Mathf.Lerp(rxBot, rxTop, profileT);
                float rz = Mathf.Lerp(rzBot, rzTop, profileT);

                // Natural chest fullness and subtle waist taper
                if (t > 0.28f && t < 0.88f)
                {
                    float chestBulge = Mathf.Sin((t - 0.28f) / 0.60f * Mathf.PI) * 0.020f;
                    rz += chestBulge;
                    rx += chestBulge * 0.55f;
                }
                else if (t <= 0.28f)
                {
                    // Subtle jacket hem rib band at bottom edge
                    float hemBulge = t < 0.12f ? Mathf.Sin(t / 0.12f * Mathf.PI) * 0.006f : 0f;
                    rx += hemBulge;
                    rz += hemBulge;
                }

                for (int s = 0; s <= segments; s++)
                {
                    float u = (float)s / segments;
                    float phi = u * 2f * Mathf.PI;
                    float cosP = Mathf.Cos(phi);
                    float sinP = Mathf.Sin(phi);

                    // Subtle center-front jacket seam relief along +Z (cosP > 0.90)
                    float frontSeam = (cosP > 0.92f && t < 0.88f) ? 0.004f * ((cosP - 0.92f) / 0.08f) : 0f;

                    float x = sinP * rx;
                    float z = cosP * rz + frontSeam;

                    vertices.Add(new Vector3(x, y, z));
                    float ny = t > 0.85f ? Mathf.Lerp(0.15f, 0.65f, (t - 0.85f) / 0.15f) : (t - 0.5f) * 0.22f;
                    normals.Add(new Vector3(sinP / rx, ny, cosP / rz).normalized);
                    uvs.Add(new Vector2(u, t));
                }
            }

            for (int r = 0; r < rings; r++)
            {
                for (int s = 0; s < segments; s++)
                {
                    int cur = r * (segments + 1) + s;
                    int nxt = cur + segments + 1;

                    triangles.Add(cur);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt);

                    triangles.Add(nxt);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt + 1);
                }
            }

            // Closed top shoulder/neck cap (+Y normal, clockwise from +Y)
            int topCenter = vertices.Count;
            vertices.Add(new Vector3(0f, height * 0.5f + 0.010f, 0f));
            normals.Add(Vector3.up);
            uvs.Add(new Vector2(0.5f, 0.5f));

            int topRingStart = rings * (segments + 1);
            for (int s = 0; s < segments; s++)
            {
                triangles.Add(topCenter);
                triangles.Add(topRingStart + s);
                triangles.Add(topRingStart + s + 1);
            }

            // Closed bottom waist cap (-Y normal, clockwise from -Y)
            int botCenter = vertices.Count;
            vertices.Add(new Vector3(0f, -height * 0.5f, 0f));
            normals.Add(Vector3.down);
            uvs.Add(new Vector2(0.5f, 0.5f));

            for (int s = 0; s < segments; s++)
            {
                triangles.Add(botCenter);
                triangles.Add(s + 1);
                triangles.Add(s);
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a sculpted collar band framing the base of the neck for streetwear innerwear.
        /// Uses x = sin(phi), z = cos(phi) with verified outward clockwise winding.
        /// </summary>
        public static Mesh CreateCollarMesh(float width = 0.21f, float depth = 0.18f, float height = 0.048f, int segments = 20)
        {
            Mesh mesh = new Mesh { name = "MVC_BobbleheadBase_Collar_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var triangles = new List<int>();

            float hw = width * 0.5f;
            float hd = depth * 0.5f;
            float bandThick = 0.030f;

            for (int i = 0; i <= segments; i++)
            {
                float t = (float)i / segments;
                float phi = t * 2f * Mathf.PI;
                float sinP = Mathf.Sin(phi);
                float cosP = Mathf.Cos(phi);

                // Slight V-dip in front (+Z, cosP > 0.4) and higher stand in back (-Z)
                float vDip = cosP > 0.4f ? -0.008f * ((cosP - 0.4f) / 0.6f) : 0.005f * (1f - Mathf.Max(0f, cosP));

                float outX = sinP * hw;
                float outZ = cosP * hd;
                float inX = sinP * (hw - bandThick);
                float inZ = cosP * (hd - bandThick);

                // 0: Outer Top rim
                vertices.Add(new Vector3(outX, height * 0.5f + vDip, outZ));
                normals.Add(new Vector3(sinP * 0.5f, 0.85f, cosP * 0.5f).normalized);

                // 1: Inner Top rim
                vertices.Add(new Vector3(inX, height * 0.5f + vDip, inZ));
                normals.Add(new Vector3(-sinP * 0.3f, 0.90f, -cosP * 0.3f).normalized);

                // 2: Outer Bottom rim
                vertices.Add(new Vector3(outX * 1.08f, -height * 0.5f, outZ * 1.08f));
                normals.Add(new Vector3(sinP, 0.2f, cosP).normalized);

                // 3: Inner Bottom rim
                vertices.Add(new Vector3(inX * 0.85f, -height * 0.5f, inZ * 0.85f));
                normals.Add(new Vector3(-sinP, 0.2f, -cosP).normalized);
            }

            for (int i = 0; i < segments; i++)
            {
                int cur = i * 4;
                int nxt = (i + 1) * 4;

                // Top bevel surface (+Y normal: Cross(P(nxt+0)-P(cur+0), P(cur+1)-P(cur+0)) = Cross(+X, -Z) = +Y)
                triangles.Add(cur + 0);
                triangles.Add(nxt + 0);
                triangles.Add(cur + 1);

                triangles.Add(cur + 1);
                triangles.Add(nxt + 0);
                triangles.Add(nxt + 1);

                // Outer wall (+Z/+X normal: Cross(P(cur+2)-P(cur+0), P(nxt+0)-P(cur+0)) = Cross(-Y, +X) = +Z)
                triangles.Add(cur + 0);
                triangles.Add(cur + 2);
                triangles.Add(nxt + 0);

                triangles.Add(nxt + 0);
                triangles.Add(cur + 2);
                triangles.Add(nxt + 2);
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates an articulated, sculpted 4-finger stylized hand (Index, Middle, Ring, Little fingers + contoured palm)
        /// with natural interdigital grooves, knuckle contour, and relaxed finger curl.
        /// </summary>
        public static Mesh CreateStylizedHand(bool isLeft, float palmWidth = 0.080f, float palmLength = 0.104f, float palmThickness = 0.046f)
        {
            Mesh mesh = new Mesh { name = $"MVC_BobbleheadBase_Hand_{(isLeft ? "L" : "R")}_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var triangles = new List<int>();

            int latSegments = 14;
            int lonSegments = 24;
            float hw = palmWidth * 0.5f;
            float ht = palmThickness * 0.5f;
            float sign = isLeft ? 1f : -1f;

            for (int lat = 0; lat <= latSegments; lat++)
            {
                float v = (float)lat / latSegments; // 0 = wrist, 0.50 = knuckles, 1.0 = fingertips
                float y = -v * palmLength;

                // Width & thickness envelope from wrist -> metacarpal palm -> fingers -> rounded fingertips
                float widthScale;
                float thickScale;
                if (v < 0.45f)
                {
                    float pt = v / 0.45f;
                    widthScale = Mathf.Lerp(0.76f, 1.04f, Mathf.Sin(pt * Mathf.PI * 0.5f));
                    thickScale = Mathf.Lerp(0.88f, 1.00f, pt);
                }
                else
                {
                    float ft = (v - 0.45f) / 0.55f;
                    widthScale = Mathf.Lerp(1.04f, 0.72f, ft * ft);
                    thickScale = Mathf.Lerp(1.00f, 0.42f, Mathf.Pow(ft, 1.3f));
                }

                // Natural relaxed inward curl of palm and fingers toward +Z (front of body)
                float curlZ = v > 0.35f ? Mathf.Pow((v - 0.35f) / 0.65f, 1.6f) * 0.016f : 0f;

                for (int lon = 0; lon <= lonSegments; lon++)
                {
                    float u = (float)lon / lonSegments;
                    float phi = u * 2f * Mathf.PI;
                    float cosP = Mathf.Cos(phi);
                    float sinP = Mathf.Sin(phi);

                    float baseX = cosP * hw * widthScale;
                    float baseZ = sinP * ht * thickScale;

                    // In the finger zone (v >= 0.48), sculpt 4 distinct articulated fingers across the lateral span (cosP)
                    float fingerGrooveZ = 1.0f;
                    float fingerLenOffset = 0f;
                    if (v >= 0.48f)
                    {
                        float fingerMask = Mathf.Clamp01((v - 0.48f) / 0.25f);
                        // Map cosP in [-1, 1] across 4 fingers (4 lobes -> cos(4 * acos(cosP)) or cos(cosP * 3.5 * pi))
                        float fingerWave = Mathf.Cos(cosP * 3.0f * Mathf.PI); // Peaks at 4 finger centers, troughs at 3 interdigital clefts
                        fingerGrooveZ = 1.0f + 0.22f * fingerWave * fingerMask;

                        // Natural finger length arc: Middle & Ring longest near center, Index & Little slightly shorter at edges
                        float archDrop = (1f - cosP * cosP) * 0.008f - (sign * cosP < -0.4f ? 0.006f : 0f);
                        fingerLenOffset = -archDrop * Mathf.Clamp01((v - 0.65f) / 0.35f);
                    }

                    float x = baseX;
                    float effY = y + fingerLenOffset;
                    float z = baseZ * fingerGrooveZ + curlZ;

                    Vector3 pos = new Vector3(x, effY, z);
                    vertices.Add(pos);

                    float dGroove = (v >= 0.48f) ? -Mathf.Sin(cosP * 3.0f * Mathf.PI) * 0.30f : 0f;
                    Vector3 norm = new Vector3(cosP / hw + dGroove, v > 0.85f ? -0.65f : 0f, sinP / ht).normalized;
                    normals.Add(norm);
                }
            }

            for (int lat = 0; lat < latSegments; lat++)
            {
                for (int lon = 0; lon < lonSegments; lon++)
                {
                    int current = lat * (lonSegments + 1) + lon;
                    int next = current + lonSegments + 1;

                    triangles.Add(current);
                    triangles.Add(current + 1);
                    triangles.Add(next);

                    triangles.Add(next);
                    triangles.Add(current + 1);
                    triangles.Add(next + 1);
                }
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a 3D sculpted opposable thumb mesh with a rounded thenar base and distal phalanx tip.
        /// </summary>
        public static Mesh CreateSculptedThumbMesh(bool isLeft, float radius = 0.017f, float length = 0.048f)
        {
            Mesh mesh = new Mesh { name = $"MVC_BobbleheadBase_Thumb_{(isLeft ? "L" : "R")}_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var triangles = new List<int>();

            int rings = 7;
            int segments = 12;
            for (int r = 0; r <= rings; r++)
            {
                float t = (float)r / rings; // 0 = base, 1 = thumb tip
                float y = -t * length;
                float rad = t < 0.7f
                    ? Mathf.Lerp(radius * 1.18f, radius * 0.92f, t / 0.7f)
                    : radius * 0.92f * Mathf.Cos((t - 0.7f) / 0.3f * Mathf.PI * 0.48f);
                float bendZ = Mathf.Sin(t * Mathf.PI * 0.6f) * 0.006f;

                for (int s = 0; s <= segments; s++)
                {
                    float u = (float)s / segments;
                    float phi = u * 2f * Mathf.PI;
                    float x = Mathf.Cos(phi) * rad;
                    float z = Mathf.Sin(phi) * rad * 0.88f + bendZ;

                    vertices.Add(new Vector3(x, y, z));
                    normals.Add(new Vector3(Mathf.Cos(phi), t > 0.75f ? -0.6f : 0f, Mathf.Sin(phi)).normalized);
                }
            }

            for (int r = 0; r < rings; r++)
            {
                for (int s = 0; s < segments; s++)
                {
                    int cur = r * (segments + 1) + s;
                    int nxt = cur + segments + 1;

                    triangles.Add(cur);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt);

                    triangles.Add(nxt);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt + 1);
                }
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a 3D sculpted human ear pinna with an outer C-shaped helix rim, rounded earlobe, and subtle concha hollow.
        /// Uses closed ellipsoid topology (x = sin(phi), z = cos(phi)) with verified outward clockwise winding.
        /// </summary>
        public static Mesh CreateStylizedEarMesh(bool isLeft, float width = 0.056f, float height = 0.104f, float depth = 0.036f)
        {
            Mesh mesh = new Mesh { name = $"MVC_BobbleheadBase_Ear_{(isLeft ? "L" : "R")}_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var triangles = new List<int>();

            int latSegments = 10;
            int lonSegments = 18;
            float rx = width * 0.5f;
            float ry = height * 0.5f;
            float rz = depth * 0.5f;
            float sign = isLeft ? -1f : 1f;

            for (int lat = 0; lat <= latSegments; lat++)
            {
                float v = (float)lat / latSegments;
                float theta = (v - 0.5f) * Mathf.PI; // -pi/2 (bottom earlobe) to +pi/2 (top helix)
                float cosT = Mathf.Cos(theta);
                float sinT = Mathf.Sin(theta);

                // Slightly narrower at earlobe (sinT < 0), fuller across upper pinna
                float lobeScale = sinT < 0f ? Mathf.Lerp(1.0f, 0.80f, -sinT) : Mathf.Lerp(1.0f, 1.06f, sinT);

                for (int lon = 0; lon <= lonSegments; lon++)
                {
                    float u = (float)lon / lonSegments;
                    float phi = u * 2f * Mathf.PI;
                    float sinP = Mathf.Sin(phi);
                    float cosP = Mathf.Cos(phi);

                    // Sculpted concha hollow on anterior face (cosP > 0.35) surrounded by raised C-helix rim
                    float conchaMod = 1.0f;
                    if (cosP > 0.35f && Mathf.Abs(sinT) < 0.65f && sign * sinP < 0.45f)
                    {
                        float centerDist = Mathf.Sqrt(sinP * sinP + sinT * sinT);
                        if (centerDist < 0.58f)
                        {
                            conchaMod = Mathf.Lerp(0.45f, 1.0f, centerDist / 0.58f);
                        }
                        else
                        {
                            conchaMod = 1.16f; // Raised outer helix rim
                        }
                    }

                    float x = rx * cosT * lobeScale * sinP;
                    float y = ry * sinT;
                    float z = rz * cosT * conchaMod * cosP;

                    vertices.Add(new Vector3(x, y, z));
                    normals.Add(new Vector3(sinP * cosT / rx, sinT / ry, cosP * cosT / rz).normalized);
                }
            }

            for (int lat = 0; lat < latSegments; lat++)
            {
                for (int lon = 0; lon < lonSegments; lon++)
                {
                    int cur = lat * (lonSegments + 1) + lon;
                    int nxt = cur + lonSegments + 1;

                    triangles.Add(cur);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt);

                    triangles.Add(nxt);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt + 1);
                }
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates an expressive arched stylized eyebrow with tapered ends.
        /// Accounts for left/right asymmetry so the medial brow is thicker and tapers outward.
        /// </summary>
        public static Mesh CreateStylizedEyebrow(bool isLeft = true, float length = 0.082f, float thickness = 0.016f, float arch = 0.012f, int segments = 10)
        {
            Mesh mesh = new Mesh { name = $"Bobblehead_Eyebrow_{(isLeft ? "L" : "R")}_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var triangles = new List<int>();

            float halfLen = length * 0.5f;

            for (int i = 0; i <= segments; i++)
            {
                float t = (float)i / segments;
                float x = isLeft ? Mathf.Lerp(halfLen, -halfLen, t) : Mathf.Lerp(-halfLen, halfLen, t);
                float yArch = Mathf.Sin(t * Mathf.PI) * arch;
                float curThick = thickness * Mathf.Lerp(1.15f, 0.45f, t) * Mathf.Sin(t * Mathf.PI * 0.90f + 0.15f);

                vertices.Add(new Vector3(x, yArch + curThick * 0.5f, 0.014f));
                normals.Add(Vector3.forward);

                vertices.Add(new Vector3(x, yArch - curThick * 0.5f, 0.008f));
                normals.Add(Vector3.forward);
            }

            for (int i = 0; i < segments; i++)
            {
                int topCur = i * 2;
                int botCur = topCur + 1;
                int topNext = topCur + 2;
                int botNext = topCur + 3;

                triangles.Add(topCur);
                triangles.Add(botCur);
                triangles.Add(topNext);

                triangles.Add(topNext);
                triangles.Add(botCur);
                triangles.Add(botNext);

                triangles.Add(topCur);
                triangles.Add(topNext);
                triangles.Add(botCur);

                triangles.Add(topNext);
                triangles.Add(botNext);
                triangles.Add(botCur);
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a friendly stylized upward-curving smile with rounded pill ends.
        /// </summary>
        public static Mesh CreateStylizedMouth(float width = 0.075f, float thickness = 0.013f, float smileArc = 0.016f, int segments = 12)
        {
            Mesh mesh = new Mesh { name = "Bobblehead_Mouth_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var triangles = new List<int>();

            float halfWidth = width * 0.5f;

            for (int i = 0; i <= segments; i++)
            {
                float t = (float)i / segments;
                float x = Mathf.Lerp(-halfWidth, halfWidth, t);
                float y = Mathf.Pow(Mathf.Abs(x) / halfWidth, 2f) * smileArc - smileArc * 0.35f;
                float z = -Mathf.Pow(x / halfWidth, 2f) * 0.008f + 0.012f;

                float curThick = thickness * Mathf.Sin(t * Mathf.PI);
                curThick = Mathf.Max(curThick, 0.005f);

                vertices.Add(new Vector3(x, y + curThick * 0.5f, z));
                normals.Add(Vector3.forward);

                vertices.Add(new Vector3(x, y - curThick * 0.5f, z));
                normals.Add(Vector3.forward);
            }

            for (int i = 0; i < segments; i++)
            {
                int topCur = i * 2;
                int botCur = topCur + 1;
                int topNext = topCur + 2;
                int botNext = topCur + 3;

                triangles.Add(topCur);
                triangles.Add(botCur);
                triangles.Add(topNext);

                triangles.Add(topNext);
                triangles.Add(botCur);
                triangles.Add(botNext);

                triangles.Add(topCur);
                triangles.Add(topNext);
                triangles.Add(botCur);

                triangles.Add(topNext);
                triangles.Add(botNext);
                triangles.Add(botCur);
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a smooth, multi-ring sculpted nose with a structured nasal bridge emerging from the glabella,
        /// a rounded tip, and soft alar nostril wings that blend naturally into the facial planes.
        /// Since radScale decreases from v=0 (base) to v=1 (tip), outward +Z clockwise winding is (cur, cur+1, nxt).
        /// </summary>
        public static Mesh CreateStylizedButtonNose(float width = 0.056f, float height = 0.068f, float forwardDepth = 0.038f)
        {
            Mesh mesh = new Mesh { name = "MVC_BobbleheadBase_Nose_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var triangles = new List<int>();

            int rings = 8;
            int segments = 16;
            float hw = width * 0.5f;
            float hh = height * 0.5f;

            for (int r = 0; r <= rings; r++)
            {
                float v = (float)r / rings; // 0 = base hugging face, 1 = rounded nasal tip apex
                float elevate = Mathf.Sin(v * Mathf.PI * 0.5f);

                for (int s = 0; s <= segments; s++)
                {
                    float u = (float)s / segments;
                    float angle = u * 2f * Mathf.PI;
                    float cosA = Mathf.Cos(angle);
                    float sinA = Mathf.Sin(angle);

                    // Trapezoidal anatomical nose contour: narrower along upper bridge (sinA > 0), wider at nostril wings (sinA ~ -0.35)
                    float wingSpread = sinA < 0.1f ? Mathf.Lerp(1.08f, 0.74f, Mathf.Abs(sinA + 0.35f)) : Mathf.Lerp(0.84f, 0.44f, sinA);
                    float radScale = 1f - v * 0.90f;

                    float x = cosA * hw * wingSpread * radScale;
                    // Tip sits slightly below center (-hh * 0.20f) so bridge slopes down from glabella to tip
                    float yCenter = Mathf.Lerp(0f, -hh * 0.20f, elevate);
                    float y = yCenter + sinA * hh * radScale;
                    float z = elevate * forwardDepth;

                    vertices.Add(new Vector3(x, y, z));
                    normals.Add(new Vector3(cosA * 0.70f * (1f - v * 0.5f), sinA * 0.60f * (1f - v * 0.5f) + 0.12f, 0.65f + elevate * 0.55f).normalized);
                }
            }

            for (int r = 0; r < rings; r++)
            {
                for (int s = 0; s < segments; s++)
                {
                    int cur = r * (segments + 1) + s;
                    int nxt = cur + segments + 1;

                    // Outward +Z clockwise winding since radScale shrinks with r (dr < 0): Cross(P(cur+1)-P(cur), P(nxt)-P(cur)) = +Z
                    triangles.Add(cur);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt);

                    triangles.Add(cur + 1);
                    triangles.Add(nxt + 1);
                    triangles.Add(nxt);
                }
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a cohesive stylized sneaker featuring a thick sculpted rubber sole,
        /// sloping toe cap, padded ankle collar, and distinct heel bumper.
        /// Soles are strictly grounded at Y = 0.00m.
        /// </summary>
        public static Mesh CreateStylizedShoe(float width = 0.155f, float height = 0.105f, float length = 0.265f)
        {
            Mesh mesh = new Mesh { name = "Bobblehead_Shoe_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            float hw = width * 0.5f;
            float hl = length * 0.5f;
            float soleHeight = 0.034f; // Thick retro sneaker midsole

            // 1. Bottom Outsole Perimeter (Y = 0)
            int segments = 12;
            int bottomCenterIdx = vertices.Count;
            vertices.Add(new Vector3(0f, 0f, 0f));
            normals.Add(Vector3.down);
            uvs.Add(new Vector2(0.5f, 0.5f));

            int botRingStart = vertices.Count;
            for (int i = 0; i < segments; i++)
            {
                float t = (float)i / segments;
                float angle = t * 2f * Mathf.PI;
                float cos = Mathf.Cos(angle);
                float sin = Mathf.Sin(angle);

                // Shoe footprint contour: wider in front, slightly narrower at arch, rounded heel
                float footW = hw * (sin > 0 ? 1.08f : 0.94f);
                if (sin > -0.2f && sin < 0.3f && cos > 0) footW *= 0.90f; // Medial arch taper

                float x = cos * footW;
                float z = sin * hl;

                vertices.Add(new Vector3(x, 0f, z));
                normals.Add(Vector3.down);
                uvs.Add(new Vector2(cos * 0.5f + 0.5f, sin * 0.5f + 0.5f));
            }

            for (int i = 0; i < segments; i++)
            {
                int next = (i + 1) % segments;
                triangles.Add(bottomCenterIdx);
                triangles.Add(botRingStart + i);
                triangles.Add(botRingStart + next);
            }

            // 2. Sole Vertical Wall (Y: 0.00m to soleHeight)
            int soleWallBot = vertices.Count;
            for (int i = 0; i < segments; i++)
            {
                Vector3 p = vertices[botRingStart + i];
                Vector3 n = new Vector3(p.x, 0f, p.z).normalized;
                vertices.Add(p);
                normals.Add(n);
                uvs.Add(new Vector2((float)i / segments, 0f));

                vertices.Add(new Vector3(p.x * 1.02f, soleHeight, p.z * 1.02f));
                normals.Add(n);
                uvs.Add(new Vector2((float)i / segments, 1f));
            }

            for (int i = 0; i < segments; i++)
            {
                int cur = soleWallBot + i * 2;
                int nxt = soleWallBot + ((i + 1) % segments) * 2;

                triangles.Add(cur);
                triangles.Add(cur + 1);
                triangles.Add(nxt);

                triangles.Add(nxt);
                triangles.Add(cur + 1);
                triangles.Add(nxt + 1);
            }

            // 3. Upper Volume (from soleHeight up to collar height)
            int upperRingBot = vertices.Count;
            for (int i = 0; i < segments; i++)
            {
                Vector3 p = vertices[botRingStart + i];
                float x = p.x * 0.96f;
                float z = p.z * 0.96f;
                vertices.Add(new Vector3(x, soleHeight, z));
                normals.Add(new Vector3(x / hw, 0.4f, z / hl).normalized);
                uvs.Add(new Vector2((float)i / segments, 0.2f));
            }

            // Ankle collar & toe box top ring
            int upperRingTop = vertices.Count;
            for (int i = 0; i < segments; i++)
            {
                float t = (float)i / segments;
                float angle = t * 2f * Mathf.PI;
                float cos = Mathf.Cos(angle);
                float sin = Mathf.Sin(angle);

                float yTop = sin > 0.1f ? Mathf.Lerp(soleHeight + 0.025f, height * 0.60f, 1f - sin) : height;
                float xTop = cos * hw * (sin > 0.1f ? 0.70f : 0.65f);
                float zTop = sin * hl * (sin > 0.1f ? 0.85f : 0.70f);

                vertices.Add(new Vector3(xTop, yTop, zTop));
                normals.Add(new Vector3(xTop / hw, 0.6f, zTop / hl).normalized);
                uvs.Add(new Vector2(t, 1f));
            }

            for (int i = 0; i < segments; i++)
            {
                int curBot = upperRingBot + i;
                int nxtBot = upperRingBot + ((i + 1) % segments);
                int curTop = upperRingTop + i;
                int nxtTop = upperRingTop + ((i + 1) % segments);

                triangles.Add(curBot);
                triangles.Add(curTop);
                triangles.Add(nxtBot);

                triangles.Add(nxtBot);
                triangles.Add(curTop);
                triangles.Add(nxtTop);
            }

            // Ankle opening / collar cap
            int collarCenter = vertices.Count;
            vertices.Add(new Vector3(0f, height * 0.85f, -hl * 0.20f));
            normals.Add(Vector3.up);
            uvs.Add(new Vector2(0.5f, 0.5f));

            for (int i = 0; i < segments; i++)
            {
                int next = (i + 1) % segments;
                triangles.Add(collarCenter);
                triangles.Add(upperRingTop + next);
                triangles.Add(upperRingTop + i);
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a conformal sneaker side-stripe accent running along the outer and inner flank.
        /// </summary>
        public static Mesh CreateSneakerStripe(float width = 0.155f, float height = 0.105f, float length = 0.265f)
        {
            Mesh mesh = new Mesh { name = "Bobblehead_SneakerStripe_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var triangles = new List<int>();

            float hw = width * 0.5f * 1.01f;
            float hl = length * 0.5f;

            // Generate lateral and medial dynamic curved wave stripes
            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1f : 1f;
                int start = vertices.Count;

                // 4-point ribbon from heel counter to mid-vamp
                float[] zs = { -hl * 0.65f, -hl * 0.25f, 0.02f, hl * 0.35f };
                float[] ys = { height * 0.70f, height * 0.60f, height * 0.45f, height * 0.38f };
                float bandH = 0.015f;

                for (int i = 0; i < zs.Length; i++)
                {
                    float x = sign * hw * (1f - Mathf.Abs(zs[i]) / (hl * 1.5f));
                    vertices.Add(new Vector3(x, ys[i] + bandH * 0.5f, zs[i]));
                    normals.Add(new Vector3(sign, 0.2f, 0f).normalized);

                    vertices.Add(new Vector3(x, ys[i] - bandH * 0.5f, zs[i]));
                    normals.Add(new Vector3(sign, -0.2f, 0f).normalized);
                }

                for (int i = 0; i < zs.Length - 1; i++)
                {
                    int c = start + i * 2;
                    if (side == 0)
                    {
                        triangles.Add(c); triangles.Add(c + 1); triangles.Add(c + 2);
                        triangles.Add(c + 2); triangles.Add(c + 1); triangles.Add(c + 3);
                    }
                    else
                    {
                        triangles.Add(c); triangles.Add(c + 2); triangles.Add(c + 1);
                        triangles.Add(c + 2); triangles.Add(c + 3); triangles.Add(c + 1);
                    }

                    // Reverse winding guarantee for zero backface culling from any angle
                    triangles.Add(c); triangles.Add(c + 1); triangles.Add(c + 2);
                    triangles.Add(c + 2); triangles.Add(c + 1); triangles.Add(c + 3);
                }
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }


        /// <summary>
        /// Creates a sculpted, textured knit streetwear beanie with a pronounced folded rib cuff,
        /// vertical knit rib channels, and casual slouch silhouette.
        /// </summary>
        public static Mesh CreateStreetBeanieMesh(float baseRadius = 0.345f, float height = 0.33f, float cuffHeight = 0.085f)
        {
            Mesh mesh = new Mesh { name = "Bobblehead_StreetBeanie_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            int cuffLatSegments = 6;
            int crownLatSegments = 14;
            int lonSegments = 60; // 3 segments per rib across 20 ribs for clean Nyquist sampling without polygon aliasing
            int ribCount = 20;

            // ZONE 1: Folded Rib Cuff (from y = -0.015m to y = cuffHeight)
            float cuffOuterRad = baseRadius + 0.026f;
            for (int lat = 0; lat <= cuffLatSegments; lat++)
            {
                float t = (float)lat / cuffLatSegments;
                float y = Mathf.Lerp(-0.015f, cuffHeight, t);

                // Slight barrel bulge in middle of cuff
                float bulge = Mathf.Sin(t * Mathf.PI) * 0.008f;
                float r = cuffOuterRad + bulge;

                for (int lon = 0; lon <= lonSegments; lon++)
                {
                    float u = (float)lon / lonSegments;
                    float phi = u * 2f * Mathf.PI;

                    // Deep vertical knit rib channels
                    float rib = 1.0f + Mathf.Cos(phi * ribCount) * 0.024f;
                    float effR = r * rib;

                    float x = effR * Mathf.Sin(phi);
                    float z = effR * Mathf.Cos(phi);

                    vertices.Add(new Vector3(x, y, z));

                    // Perturb normal laterally with rib derivative to create crisp shadow/highlight channels
                    float dRib = -Mathf.Sin(phi * ribCount) * 0.55f;
                    Vector3 radialNorm = new Vector3(Mathf.Sin(phi), 0.1f, Mathf.Cos(phi));
                    Vector3 tangentPhi = new Vector3(Mathf.Cos(phi), 0f, -Mathf.Sin(phi));
                    normals.Add((radialNorm + tangentPhi * dRib).normalized);
                    uvs.Add(new Vector2(u, t * 0.3f));
                }
            }

            // Triangles for cuff
            for (int lat = 0; lat < cuffLatSegments; lat++)
            {
                for (int lon = 0; lon < lonSegments; lon++)
                {
                    int current = lat * (lonSegments + 1) + lon;
                    int next = current + lonSegments + 1;

                    triangles.Add(current);
                    triangles.Add(current + 1);
                    triangles.Add(next);

                    triangles.Add(next);
                    triangles.Add(current + 1);
                    triangles.Add(next + 1);
                }
            }

            // ZONE 1b: Fold Shelf Lip (connecting top of cuff back inward to crown base)
            int cuffTopStart = cuffLatSegments * (lonSegments + 1);
            int crownStart = vertices.Count;

            // ZONE 2: Slouch Crown (from y = cuffHeight to y = height)
            for (int lat = 0; lat <= crownLatSegments; lat++)
            {
                float t = (float)lat / crownLatSegments;
                float theta = Mathf.Lerp(0.20f, Mathf.PI * 0.5f, t);
                float sinTheta = Mathf.Sin(theta);
                float cosTheta = Mathf.Cos(theta);

                float y = cuffHeight + (sinTheta - Mathf.Sin(0.20f)) / (1f - Mathf.Sin(0.20f)) * (height - cuffHeight);
                float slouchZ = -Mathf.Pow(t, 1.8f) * 0.045f;
                float r = (baseRadius + 0.006f) * cosTheta / Mathf.Cos(0.20f);

                for (int lon = 0; lon <= lonSegments; lon++)
                {
                    float u = (float)lon / lonSegments;
                    float phi = u * 2f * Mathf.PI;

                    float rib = 1.0f + Mathf.Cos(phi * ribCount) * (0.015f * (1f - t * 0.5f));
                    float effR = r * rib;

                    float x = effR * Mathf.Sin(phi);
                    float z = effR * Mathf.Cos(phi) + slouchZ;

                    vertices.Add(new Vector3(x, y, z));

                    float dRib = -Mathf.Sin(phi * ribCount) * 0.35f * (1f - t);
                    Vector3 radialNorm = new Vector3(Mathf.Sin(phi) * cosTheta, sinTheta, Mathf.Cos(phi) * cosTheta);
                    Vector3 tangentPhi = new Vector3(Mathf.Cos(phi), 0f, -Mathf.Sin(phi));
                    normals.Add((radialNorm + tangentPhi * dRib).normalized);
                    uvs.Add(new Vector2(u, 0.3f + t * 0.7f));
                }
            }

            // Triangles for fold shelf (bridging cuffTopStart to crownStart)
            for (int lon = 0; lon < lonSegments; lon++)
            {
                int cCur = cuffTopStart + lon;
                int cNext = cCur + 1;
                int crCur = crownStart + lon;
                int crNext = crCur + 1;

                triangles.Add(cCur);
                triangles.Add(cNext);
                triangles.Add(crCur);

                triangles.Add(crCur);
                triangles.Add(cNext);
                triangles.Add(crNext);
            }

            // Triangles for crown
            for (int lat = 0; lat < crownLatSegments; lat++)
            {
                for (int lon = 0; lon < lonSegments; lon++)
                {
                    int current = crownStart + lat * (lonSegments + 1) + lon;
                    int next = current + lonSegments + 1;

                    triangles.Add(current);
                    triangles.Add(current + 1);
                    triangles.Add(next);

                    triangles.Add(next);
                    triangles.Add(current + 1);
                    triangles.Add(next + 1);
                }
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a stylized cloth streetwear label tag with front-facing normals and crisp rectangular form.
        /// </summary>
        public static Mesh CreateStylizedLabelTag(float width = 0.052f, float height = 0.040f, float thickness = 0.010f)
        {
            Mesh mesh = new Mesh { name = "Bobblehead_LabelTag_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            float hw = width * 0.5f;
            float hh = height * 0.5f;
            float ht = thickness * 0.5f;

            // Front face (+Z)
            int vStart = vertices.Count;
            vertices.Add(new Vector3(-hw, -hh, ht));
            vertices.Add(new Vector3(hw, -hh, ht));
            vertices.Add(new Vector3(hw, hh, ht));
            vertices.Add(new Vector3(-hw, hh, ht));
            for (int i = 0; i < 4; i++) normals.Add(Vector3.forward);
            uvs.Add(new Vector2(0, 0)); uvs.Add(new Vector2(1, 0)); uvs.Add(new Vector2(1, 1)); uvs.Add(new Vector2(0, 1));
            triangles.Add(vStart); triangles.Add(vStart + 1); triangles.Add(vStart + 2);
            triangles.Add(vStart); triangles.Add(vStart + 2); triangles.Add(vStart + 3);

            // Back face (-Z)
            vStart = vertices.Count;
            vertices.Add(new Vector3(hw, -hh, -ht));
            vertices.Add(new Vector3(-hw, -hh, -ht));
            vertices.Add(new Vector3(-hw, hh, -ht));
            vertices.Add(new Vector3(hw, hh, -ht));
            for (int i = 0; i < 4; i++) normals.Add(Vector3.back);
            uvs.Add(new Vector2(0, 0)); uvs.Add(new Vector2(1, 0)); uvs.Add(new Vector2(1, 1)); uvs.Add(new Vector2(0, 1));
            triangles.Add(vStart); triangles.Add(vStart + 1); triangles.Add(vStart + 2);
            triangles.Add(vStart); triangles.Add(vStart + 2); triangles.Add(vStart + 3);

            // Left face (-X)
            vStart = vertices.Count;
            vertices.Add(new Vector3(-hw, -hh, -ht));
            vertices.Add(new Vector3(-hw, -hh, ht));
            vertices.Add(new Vector3(-hw, hh, ht));
            vertices.Add(new Vector3(-hw, hh, -ht));
            for (int i = 0; i < 4; i++) normals.Add(Vector3.left);
            uvs.Add(new Vector2(0, 0)); uvs.Add(new Vector2(1, 0)); uvs.Add(new Vector2(1, 1)); uvs.Add(new Vector2(0, 1));
            triangles.Add(vStart); triangles.Add(vStart + 1); triangles.Add(vStart + 2);
            triangles.Add(vStart); triangles.Add(vStart + 2); triangles.Add(vStart + 3);

            // Right face (+X)
            vStart = vertices.Count;
            vertices.Add(new Vector3(hw, -hh, ht));
            vertices.Add(new Vector3(hw, -hh, -ht));
            vertices.Add(new Vector3(hw, hh, -ht));
            vertices.Add(new Vector3(hw, hh, ht));
            for (int i = 0; i < 4; i++) normals.Add(Vector3.right);
            uvs.Add(new Vector2(0, 0)); uvs.Add(new Vector2(1, 0)); uvs.Add(new Vector2(1, 1)); uvs.Add(new Vector2(0, 1));
            triangles.Add(vStart); triangles.Add(vStart + 1); triangles.Add(vStart + 2);
            triangles.Add(vStart); triangles.Add(vStart + 2); triangles.Add(vStart + 3);

            // Top face (+Y)
            vStart = vertices.Count;
            vertices.Add(new Vector3(-hw, hh, ht));
            vertices.Add(new Vector3(hw, hh, ht));
            vertices.Add(new Vector3(hw, hh, -ht));
            vertices.Add(new Vector3(-hw, hh, -ht));
            for (int i = 0; i < 4; i++) normals.Add(Vector3.up);
            uvs.Add(new Vector2(0, 0)); uvs.Add(new Vector2(1, 0)); uvs.Add(new Vector2(1, 1)); uvs.Add(new Vector2(0, 1));
            triangles.Add(vStart); triangles.Add(vStart + 1); triangles.Add(vStart + 2);
            triangles.Add(vStart); triangles.Add(vStart + 2); triangles.Add(vStart + 3);

            // Bottom face (-Y)
            vStart = vertices.Count;
            vertices.Add(new Vector3(-hw, -hh, -ht));
            vertices.Add(new Vector3(hw, -hh, -ht));
            vertices.Add(new Vector3(hw, -hh, ht));
            vertices.Add(new Vector3(-hw, -hh, ht));
            for (int i = 0; i < 4; i++) normals.Add(Vector3.down);
            uvs.Add(new Vector2(0, 0)); uvs.Add(new Vector2(1, 0)); uvs.Add(new Vector2(1, 1)); uvs.Add(new Vector2(0, 1));
            triangles.Add(vStart); triangles.Add(vStart + 1); triangles.Add(vStart + 2);
            triangles.Add(vStart); triangles.Add(vStart + 2); triangles.Add(vStart + 3);

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a sculpted, textured knit beanie cap or hair crown base with an anatomical forehead hairline arch
        /// (clearing the eyebrows in front and dropping down to cover the nape in back).
        /// When underHeadwear is true, smoothly tucks upper crown vertices inside the headwear dome so
        /// the lower hairline, temples, and nape read cleanly underneath without clipping through the hat or exposing the skull.
        /// </summary>
        public static Mesh CreateBeanieCap(float baseRadius = 0.34f, float height = 0.32f, float cuffHeight = 0.085f, bool underHeadwear = false)
        {
            Mesh mesh = new Mesh { name = underHeadwear ? "MVC_BobbleheadBase_HairUnderHat_Mesh" : "Bobblehead_Beanie_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            int latSegments = 16;
            int lonSegments = 28;
            int ribCount = 24;

            for (int lat = 0; lat <= latSegments; lat++)
            {
                float v = (float)lat / latSegments;
                float theta = v * (Mathf.PI * 0.5f); // 0 (bottom brim) to pi/2 (top crown)
                float cosTheta = Mathf.Cos(theta);
                float sinTheta = Mathf.Sin(theta);

                float effHeight = underHeadwear ? height * 0.90f : height * 1.03f;
                float slouchZ = underHeadwear ? -Mathf.Pow(v, 1.8f) * 0.012f : -Mathf.Pow(v, 1.8f) * 0.032f;

                float tuckFactor = underHeadwear ? Mathf.Lerp(0.99f, 0.88f, Mathf.SmoothStep(0.10f, 0.55f, v)) : 1.0f;
                float rad = baseRadius * cosTheta * tuckFactor;

                // 1. Subtle hair volume fullness in lower 35%
                float cuffBulge = 0f;
                if (v < 0.35f)
                {
                    float cuffT = v / 0.35f;
                    float bulgeScale = underHeadwear ? 0.38f : 0.85f;
                    cuffBulge = (Mathf.Sin(cuffT * Mathf.PI) * 0.020f + 0.010f * (1f - cuffT)) * bulgeScale;
                }

                for (int lon = 0; lon <= lonSegments; lon++)
                {
                    float u = (float)lon / lonSegments;
                    float phi = u * 2f * Mathf.PI;
                    float sinP = Mathf.Sin(phi);
                    float cosP = Mathf.Cos(phi);

                    // Anatomical hairline arch: rises +0.080m in front (+Z, cosP > 0.1) to stay cleanly above eyebrows,
                    // and drops -0.075m in back (-Z, cosP < 0) to cover the occipital nape
                    float frontArch = cosP > 0.10f ? (1f - v) * 0.080f * Mathf.Pow((cosP - 0.10f) / 0.90f, 1.15f) : 0f;
                    float backNapeDrop = cosP < 0f ? (1f - v) * (-0.075f) * (-cosP) : 0f;
                    float y = sinTheta * effHeight + frontArch + backNapeDrop;

                    // 2. Subtle hair strand / rib texture catching directional lighting
                    float ribFactor = v < 0.30f ? 0.0045f : 0.0025f * (1f - v);
                    float rib = 1.0f + Mathf.Cos(phi * ribCount) * ribFactor;

                    float effectiveRad = (rad + cuffBulge) * rib;
                    float x = effectiveRad * sinP;
                    float z = effectiveRad * cosP + slouchZ;

                    Vector3 pos = new Vector3(x, y, z);
                    vertices.Add(pos);

                    Vector3 norm = new Vector3(pos.x / baseRadius, Mathf.Max(0.15f, sinTheta), (pos.z - slouchZ) / baseRadius).normalized;
                    normals.Add(norm);
                    uvs.Add(new Vector2(u, v));
                }
            }

            for (int lat = 0; lat < latSegments; lat++)
            {
                for (int lon = 0; lon < lonSegments; lon++)
                {
                    int current = lat * (lonSegments + 1) + lon;
                    int next = current + lonSegments + 1;

                    triangles.Add(current);
                    triangles.Add(current + 1);
                    triangles.Add(next);

                    triangles.Add(next);
                    triangles.Add(current + 1);
                    triangles.Add(next + 1);
                }
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Generates a voluminous, rounded afro curly hair mass with stylized curly surface modulation.
        /// When underHeadwear is true, compresses the upper dome inside the cap while keeping curly volume
        /// around the temples, ears, and nape visible underneath the headwear.
        /// </summary>
        public static Mesh CreateAfroMesh(float rx = 0.38f, float ry = 0.39f, float rz = 0.37f, int latSegments = 16, int lonSegments = 24, bool underHeadwear = false)
        {
            Mesh mesh = new Mesh { name = underHeadwear ? "MVC_BobbleheadBase_AfroUnderHat_Mesh" : "Bobblehead_Afro_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            for (int lat = 0; lat <= latSegments; lat++)
            {
                float v = (float)lat / latSegments;

                for (int lon = 0; lon <= lonSegments; lon++)
                {
                    float u = (float)lon / lonSegments;
                    float phi = u * 2f * Mathf.PI;
                    float cosPhi = Mathf.Cos(phi);
                    float sinPhi = Mathf.Sin(phi);

                    // Front hairline frames forehead above eyebrows; sides and back extend to ears/neck
                    float minTheta = cosPhi > 0f ? Mathf.Lerp(-0.05f * Mathf.PI, 0.08f * Mathf.PI, cosPhi) : -0.20f * Mathf.PI;
                    float theta = Mathf.Lerp(minTheta, 0.5f * Mathf.PI, v);
                    float cosTheta = Mathf.Cos(theta);
                    float sinTheta = Mathf.Sin(theta);

                    // Stylized tight curl texture lobes
                    float curl = 1.0f + 0.035f * Mathf.Sin(phi * 8f) * Mathf.Cos(theta * 6f);

                    // If worn under a cap or beanie, tuck the upper crown (theta > 0.08*pi) inside the hat dome
                    // while preserving the curly halo around the temples, sides, and nape below the hat line
                    float hatTuckRad = 1.0f;
                    float hatTuckY = 1.0f;
                    if (underHeadwear)
                    {
                        float crownWeight = Mathf.SmoothStep(0.02f * Mathf.PI, 0.22f * Mathf.PI, theta);
                        hatTuckRad = Mathf.Lerp(0.95f, 0.72f, crownWeight);
                        hatTuckY = Mathf.Lerp(0.92f, 0.66f, crownWeight);
                        curl = Mathf.Lerp(curl, 1.0f, crownWeight);
                    }

                    float x = rx * hatTuckRad * cosTheta * sinPhi * curl;
                    float y = ry * hatTuckY * sinTheta * curl;
                    float z = rz * hatTuckRad * cosTheta * cosPhi * curl;

                    Vector3 pos = new Vector3(x, y, z);
                    vertices.Add(pos);
                    normals.Add(new Vector3(pos.x / rx, pos.y / ry, pos.z / rz).normalized);
                    uvs.Add(new Vector2(u, v));
                }
            }

            for (int lat = 0; lat < latSegments; lat++)
            {
                for (int lon = 0; lon < lonSegments; lon++)
                {
                    int current = lat * (lonSegments + 1) + lon;
                    int next = current + lonSegments + 1;

                    triangles.Add(current);
                    triangles.Add(current + 1);
                    triangles.Add(next);

                    triangles.Add(next);
                    triangles.Add(current + 1);
                    triangles.Add(next + 1);
                }
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates the original project-owned MVC_BobbleheadBase stylized baseball cap mesh (crown + curved front visor).
        /// Features a structured 6-panel crown with subtle seam grooves, a contoured sweatband rim that welds seamlessly
        /// to the arched front visor while hugging the occipital curve at the back, and a 3D curved front visor.
        /// </summary>
        public static Mesh CreateBaseballCapCrownAndVisorMesh(float baseRadiusX = 0.352f, float baseRadiusZ = 0.340f, float crownHeight = 0.255f)
        {
            Mesh mesh = new Mesh { name = "MVC_BobbleheadBase_BaseballCap_CrownVisor_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            int crownLat = 14;
            int crownLon = 48;
            float maxPhi = 54f * Mathf.Deg2Rad; // Visor span: -54 deg to +54 deg across the front of the crown

            // =========================================================================
            // PART 1: Structured 6-Panel Baseball Cap Crown Dome
            // =========================================================================
            for (int lat = 0; lat <= crownLat; lat++)
            {
                float v = (float)lat / crownLat; // 0 = bottom band rim, 1 = top apex
                float theta = v * Mathf.PI * 0.5f;
                float cosT = Mathf.Cos(theta);
                float sinT = Mathf.Sin(theta);

                // Structured front panel profile: fuller dome profile in upper-mid crown
                float structuredDome = Mathf.Pow(cosT, 0.85f);
                // Bottom sweatband rim reinforcement in lower 18%
                float bandRim = v < 0.18f ? Mathf.Sin(v / 0.18f * Mathf.PI) * 0.008f + 0.005f * (1f - v / 0.18f) : 0f;

                for (int lon = 0; lon <= crownLon; lon++)
                {
                    float u = (float)lon / crownLon;
                    float phi = u * 2f * Mathf.PI; // phi = 0 is +Z (front center), phi = pi is -Z (back center)
                    float sinP = Mathf.Sin(phi);
                    float cosP = Mathf.Cos(phi);

                    // Signed angle from front (+Z) in [-pi, +pi]
                    float signedPhi = Mathf.Atan2(sinP, cosP);

                    // 6-panel seam channels at every 60 degrees
                    float seamGroove = 1.0f - 0.005f * Mathf.Pow(Mathf.Abs(Mathf.Cos(phi * 3f)), 8f) * (1f - v * 0.5f);

                    // Match the exact transverse arch of the visor across the front span (|signedPhi| <= maxPhi)
                    // while sloping down to -0.056m at the rear occipital curve (cosP = -1)
                    float baseRimY = Mathf.Lerp(-0.056f, 0.002f, (cosP + 1f) * 0.5f);
                    float frontVisorArch = 0f;
                    if (Mathf.Abs(signedPhi) < maxPhi)
                    {
                        float sVis = signedPhi / maxPhi;
                        frontVisorArch = (1f - sVis * sVis) * 0.022f;
                    }
                    float rimSlopeY = (baseRimY + frontVisorArch) * (1f - v);

                    // Front panels of a structured baseball cap stand slightly prouder
                    float frontPanelBoostZ = (cosP > 0f && v > 0.10f && v < 0.80f)
                        ? Mathf.Sin((v - 0.10f) / 0.70f * Mathf.PI) * cosP * 0.015f
                        : 0f;

                    float rx = (baseRadiusX * structuredDome + bandRim) * seamGroove;
                    float rz = (baseRadiusZ * structuredDome + bandRim) * seamGroove;

                    float x = rx * sinP;
                    float y = sinT * crownHeight + rimSlopeY;
                    float z = rz * cosP + frontPanelBoostZ;

                    vertices.Add(new Vector3(x, y, z));
                    Vector3 norm = new Vector3(sinP * cosT / baseRadiusX, Mathf.Max(0.18f, sinT), cosP * cosT / baseRadiusZ).normalized;
                    normals.Add(norm);
                    uvs.Add(new Vector2(u, v * 0.7f));
                }
            }

            for (int lat = 0; lat < crownLat; lat++)
            {
                for (int lon = 0; lon < crownLon; lon++)
                {
                    int cur = lat * (crownLon + 1) + lon;
                    int nxt = cur + crownLon + 1;

                    triangles.Add(cur);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt);

                    triangles.Add(nxt);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt + 1);
                }
            }

            // Inner sweatband underside closure ring at lat = 0 (-Y normal) so cap rim is solid from below
            int sweatBandStart = vertices.Count;
            for (int lon = 0; lon <= crownLon; lon++)
            {
                Vector3 outerRim = vertices[lon];
                vertices.Add(outerRim);
                normals.Add(Vector3.down);
                uvs.Add(new Vector2((float)lon / crownLon, 0f));

                vertices.Add(new Vector3(outerRim.x * 0.80f, outerRim.y + 0.004f, outerRim.z * 0.80f));
                normals.Add(Vector3.down);
                uvs.Add(new Vector2((float)lon / crownLon, 0.1f));
            }
            for (int lon = 0; lon < crownLon; lon++)
            {
                int c = sweatBandStart + lon * 2;
                triangles.Add(c);
                triangles.Add(c + 1);
                triangles.Add(c + 2);

                triangles.Add(c + 2);
                triangles.Add(c + 1);
                triangles.Add(c + 3);
            }

            // =========================================================================
            // PART 2: Curved 3D Front Visor / Bill (Top Face, Underbrim, & Outer Rim)
            // =========================================================================
            int visorWidthSegs = 24;
            int visorLenSegs = 10;
            float visorCenterLength = 0.200f; // Proud, unmistakable baseball-cap bill projection

            int visorTopStart = vertices.Count;
            // 2a. Top surface of visor (+Y outward normal)
            for (int l = 0; l <= visorLenSegs; l++)
            {
                float tLen = (float)l / visorLenSegs; // 0 = welded inside crown band, 1 = front tip of bill
                float thickness = Mathf.Lerp(0.018f, 0.012f, tLen);

                for (int w = 0; w <= visorWidthSegs; w++)
                {
                    float tWid = (float)w / visorWidthSegs; // 0 = left edge (-X), 1 = right edge (+X)
                    float s = (tWid - 0.5f) * 2f; // -1 to +1

                    // Rounded parabolic front corners of the visor bill
                    float cornerRound = Mathf.Sqrt(Mathf.Max(0.10f, 1f - 0.50f * s * s * tLen * tLen));
                    float phi = s * maxPhi * Mathf.Lerp(1.0f, 0.86f, tLen);
                    float sinP = Mathf.Sin(phi);
                    float cosP = Mathf.Cos(phi);

                    // Root coordinates overlapped 22mm inside the lower front crown band for an airtight weld
                    float rootInset = Mathf.Lerp(0.022f, 0.0f, Mathf.Min(1f, tLen * 3.5f));
                    float rootX = (baseRadiusX - rootInset) * sinP;
                    float rootZ = (baseRadiusZ - rootInset) * cosP;

                    // Forward extension along +Z and slight lateral flare
                    float extZ = tLen * visorCenterLength * cornerRound;
                    float x = rootX + s * tLen * 0.012f * cornerRound;
                    float z = rootZ + extZ;

                    // Matches the exact frontVisorArch at the crown rim (+0.022m center arch) so there is zero gap
                    float transverseArchY = (1f - s * s) * 0.022f;
                    float forwardSlopeY = -tLen * 0.008f;
                    float yTop = 0.002f + transverseArchY + forwardSlopeY + thickness * 0.5f;

                    vertices.Add(new Vector3(x, yTop, z));
                    Vector3 archNorm = new Vector3(s * 0.30f, 0.93f, 0.18f).normalized;
                    normals.Add(archNorm);
                    uvs.Add(new Vector2(tWid, 0.7f + tLen * 0.3f));
                }
            }

            for (int l = 0; l < visorLenSegs; l++)
            {
                for (int w = 0; w < visorWidthSegs; w++)
                {
                    int cur = visorTopStart + l * (visorWidthSegs + 1) + w;
                    int nxt = cur + visorWidthSegs + 1;

                    // Cross(P(nxt)-P(cur), P(cur+1)-P(cur)) = Cross(+Z, +X) = +Y (upward outward)
                    triangles.Add(cur);
                    triangles.Add(nxt);
                    triangles.Add(cur + 1);

                    triangles.Add(cur + 1);
                    triangles.Add(nxt);
                    triangles.Add(nxt + 1);
                }
            }

            // 2b. Bottom underbrim surface of visor (-Y outward normal)
            int visorBotStart = vertices.Count;
            for (int l = 0; l <= visorLenSegs; l++)
            {
                float tLen = (float)l / visorLenSegs;
                float thickness = Mathf.Lerp(0.018f, 0.012f, tLen);

                for (int w = 0; w <= visorWidthSegs; w++)
                {
                    int topIdx = visorTopStart + l * (visorWidthSegs + 1) + w;
                    Vector3 topPos = vertices[topIdx];
                    float s = ((float)w / visorWidthSegs - 0.5f) * 2f;

                    vertices.Add(new Vector3(topPos.x, topPos.y - thickness, topPos.z));
                    normals.Add(new Vector3(-s * 0.25f, -0.95f, -0.10f).normalized);
                    uvs.Add(uvs[topIdx]);
                }
            }

            for (int l = 0; l < visorLenSegs; l++)
            {
                for (int w = 0; w < visorWidthSegs; w++)
                {
                    int cur = visorBotStart + l * (visorWidthSegs + 1) + w;
                    int nxt = cur + visorWidthSegs + 1;

                    // Cross(P(cur+1)-P(cur), P(nxt)-P(cur)) = Cross(+X, +Z) = -Y (downward outward)
                    triangles.Add(cur);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt);

                    triangles.Add(cur + 1);
                    triangles.Add(nxt + 1);
                    triangles.Add(nxt);
                }
            }

            // 2c. Stitch outer perimeter rim (Left edge, Front lip, Right edge) connecting Top & Bottom visor surfaces
            var perimeterTop = new List<int>();
            var perimeterBot = new List<int>();

            // Left edge (w = 0, l from 0 to visorLenSegs)
            for (int l = 0; l <= visorLenSegs; l++)
            {
                perimeterTop.Add(visorTopStart + l * (visorWidthSegs + 1));
                perimeterBot.Add(visorBotStart + l * (visorWidthSegs + 1));
            }
            // Front edge (l = visorLenSegs, w from 1 to visorWidthSegs)
            for (int w = 1; w <= visorWidthSegs; w++)
            {
                perimeterTop.Add(visorTopStart + visorLenSegs * (visorWidthSegs + 1) + w);
                perimeterBot.Add(visorBotStart + visorLenSegs * (visorWidthSegs + 1) + w);
            }
            // Right edge (w = visorWidthSegs, l from visorLenSegs - 1 down to 0)
            for (int l = visorLenSegs - 1; l >= 0; l--)
            {
                perimeterTop.Add(visorTopStart + l * (visorWidthSegs + 1) + visorWidthSegs);
                perimeterBot.Add(visorBotStart + l * (visorWidthSegs + 1) + visorWidthSegs);
            }

            int rimStart = vertices.Count;
            for (int i = 0; i < perimeterTop.Count; i++)
            {
                Vector3 pT = vertices[perimeterTop[i]];
                Vector3 pB = vertices[perimeterBot[i]];
                Vector3 outN = new Vector3(pT.x, 0.1f, Mathf.Max(0.1f, pT.z - baseRadiusZ * 0.6f)).normalized;

                vertices.Add(pT);
                normals.Add(outN);
                uvs.Add(new Vector2((float)i / perimeterTop.Count, 1f));

                vertices.Add(pB);
                normals.Add(outN);
                uvs.Add(new Vector2((float)i / perimeterTop.Count, 0f));
            }

            for (int i = 0; i < perimeterTop.Count - 1; i++)
            {
                int curT = rimStart + i * 2;
                int curB = curT + 1;
                int nxtT = curT + 2;
                int nxtB = curT + 3;

                // Outward edge normal: Cross(P(curB)-P(curT), P(nxtT)-P(curT)) = Cross(-Y, +tangent) = outward
                triangles.Add(curT);
                triangles.Add(curB);
                triangles.Add(nxtT);

                triangles.Add(nxtT);
                triangles.Add(curB);
                triangles.Add(nxtB);
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates the front shield emblem patch and top crown button (squatchee) for the MVC_BobbleheadBase baseball cap,
        /// tinted by headwearAccentColor. Uses verified +Z and +Y outward clockwise winding.
        /// </summary>
        public static Mesh CreateBaseballCapEmblemMesh(float baseRadiusZ = 0.340f, float crownHeight = 0.255f)
        {
            Mesh mesh = new Mesh { name = "MVC_BobbleheadBase_BaseballCap_Emblem_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            // 1. Raised Curved Shield / Home-Plate Emblem on Front Center Panel
            int cols = 8;
            int rows = 8;
            float halfW = 0.048f;
            float minY = 0.056f;
            float maxY = 0.142f;
            float reliefDepth = 0.012f;

            int frontGridStart = vertices.Count;
            for (int r = 0; r <= rows; r++)
            {
                float tv = (float)r / rows; // 0 = bottom point of shield, 1 = top edge
                float y = Mathf.Lerp(minY, maxY, tv);
                float vCap = Mathf.Clamp01((y - 0.024f) / crownHeight);
                float theta = Mathf.Asin(Mathf.Clamp(vCap, 0f, 0.98f));
                float cosT = Mathf.Cos(theta);
                float structuredDome = Mathf.Pow(cosT, 0.85f);
                float frontBoostZ = (vCap > 0.10f && vCap < 0.80f)
                    ? Mathf.Sin((vCap - 0.10f) / 0.70f * Mathf.PI) * 0.015f
                    : 0f;

                // Shield width profile: pointed bottom tip (tv < 0.35), broader upper crest
                float shieldWidthScale = tv < 0.35f ? Mathf.Lerp(0.28f, 1.0f, tv / 0.35f) : Mathf.Lerp(1.0f, 0.88f, (tv - 0.35f) / 0.65f);

                for (int c = 0; c <= cols; c++)
                {
                    float tu = (float)c / cols;
                    float s = (tu - 0.5f) * 2f; // -1 to +1
                    float x = s * halfW * shieldWidthScale;

                    // Conformal Z on the cap crown surface + raised embroidery bevel
                    float edgeBevel = Mathf.Sin(Mathf.Clamp01(1f - Mathf.Max(Mathf.Abs(s), Mathf.Abs(tv - 0.5f) * 2f) * 0.85f) * Mathf.PI * 0.5f);
                    float capSurfZ = Mathf.Sqrt(Mathf.Max(0.01f, Mathf.Pow(baseRadiusZ * structuredDome, 2f) - x * x)) + frontBoostZ;
                    float z = capSurfZ + 0.005f + reliefDepth * edgeBevel;

                    vertices.Add(new Vector3(x, y, z));
                    normals.Add(new Vector3(s * 0.25f, (tv - 0.4f) * 0.25f, 0.94f).normalized);
                    uvs.Add(new Vector2(tu, tv));
                }
            }

            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < cols; c++)
                {
                    int cur = frontGridStart + r * (cols + 1) + c;
                    int nxt = cur + cols + 1;

                    // Outward +Z clockwise winding: Cross(P(cur+1)-P(cur), P(nxt)-P(cur)) = Cross(+X, +Y) = +Z
                    triangles.Add(cur);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt);

                    triangles.Add(nxt);
                    triangles.Add(cur + 1);
                    triangles.Add(nxt + 1);
                }
            }

            // 2. Classic Top Crown Button (Squatchee) at Apex (y = crownHeight)
            int btnStart = vertices.Count;
            int btnSegs = 14;
            float btnRad = 0.024f;
            float btnH = 0.014f;

            vertices.Add(new Vector3(0f, crownHeight + btnH, 0f));
            normals.Add(Vector3.up);
            uvs.Add(new Vector2(0.5f, 0.5f));

            for (int i = 0; i <= btnSegs; i++)
            {
                float u = (float)i / btnSegs;
                float phi = u * 2f * Mathf.PI;
                float bx = Mathf.Sin(phi) * btnRad;
                float bz = Mathf.Cos(phi) * btnRad;

                vertices.Add(new Vector3(bx, crownHeight - 0.002f, bz));
                normals.Add(new Vector3(Mathf.Sin(phi) * 0.6f, 0.8f, Mathf.Cos(phi) * 0.6f).normalized);
                uvs.Add(new Vector2(u, 0f));
            }

            for (int i = 1; i <= btnSegs; i++)
            {
                triangles.Add(btnStart);
                triangles.Add(btnStart + i);
                triangles.Add(btnStart + i + 1);
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates an arched, sweeping ponytail plume with stylized downward curve.
        /// </summary>
        public static Mesh CreatePonytailPlume(float length = 0.28f, float topRadius = 0.08f, float midRadius = 0.095f, float endRadius = 0.035f, int segments = 14)
        {
            Mesh mesh = new Mesh { name = "Bobblehead_Ponytail_Plume_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            int rings = 8;
            for (int r = 0; r <= rings; r++)
            {
                float t = (float)r / rings;
                float y = -t * length * 0.90f;
                float z = -Mathf.Sin(t * Mathf.PI * 0.5f) * length * 0.55f;

                float rad = t < 0.4f ? Mathf.Lerp(topRadius, midRadius, t / 0.4f) : Mathf.Lerp(midRadius, endRadius, (t - 0.4f) / 0.6f);

                for (int s = 0; s <= segments; s++)
                {
                    float u = (float)s / segments;
                    float angle = u * 2f * Mathf.PI;
                    float x = Mathf.Cos(angle) * rad;
                    float localY = Mathf.Sin(angle) * rad;

                    Vector3 pos = new Vector3(x, y + localY, z);
                    vertices.Add(pos);
                    normals.Add(new Vector3(x, localY, -0.5f).normalized);
                    uvs.Add(new Vector2(u, t));
                }
            }

            for (int r = 0; r < rings; r++)
            {
                for (int s = 0; s < segments; s++)
                {
                    int current = r * (segments + 1) + s;
                    int next = current + segments + 1;

                    triangles.Add(current);
                    triangles.Add(current + 1);
                    triangles.Add(next);

                    triangles.Add(next);
                    triangles.Add(current + 1);
                    triangles.Add(next + 1);
                }
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a stylized curved mustache mesh with two wings meeting above the mouth.
        /// </summary>
        public static Mesh CreateMustacheMesh(float width = 0.13f, float height = 0.032f, float depth = 0.024f)
        {
            Mesh mesh = new Mesh { name = "Bobblehead_Mustache_Mesh" };
            float hw = width * 0.5f;

            Vector3[] v = new Vector3[]
            {
                // Center philtrum
                new Vector3(0f, height * 0.3f, depth),
                new Vector3(0f, -height * 0.4f, depth),
                // Left wing upper, tip, lower
                new Vector3(-hw * 0.5f, height * 0.5f, depth * 0.9f),
                new Vector3(-hw, -height * 0.2f, depth * 0.4f),
                new Vector3(-hw * 0.5f, -height * 0.5f, depth * 0.8f),
                // Right wing upper, tip, lower
                new Vector3(hw * 0.5f, height * 0.5f, depth * 0.9f),
                new Vector3(hw, -height * 0.2f, depth * 0.4f),
                new Vector3(hw * 0.5f, -height * 0.5f, depth * 0.8f)
            };

            int[] tri = new int[]
            {
                // Left wing
                0, 2, 4,   0, 4, 1,   2, 3, 4,
                // Right wing
                0, 1, 7,   0, 7, 5,   5, 7, 6
            };

            mesh.vertices = v;
            mesh.triangles = tri;
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a stylized chin goatee patch beneath the mouth.
        /// </summary>
        public static Mesh CreateGoateeMesh(float width = 0.065f, float height = 0.065f, float depth = 0.025f)
        {
            Mesh mesh = new Mesh { name = "Bobblehead_Goatee_Mesh" };
            float hw = width * 0.5f;
            float hh = height * 0.5f;

            Vector3[] v = new Vector3[]
            {
                new Vector3(-hw * 0.6f, hh, depth * 0.5f),
                new Vector3(hw * 0.6f, hh, depth * 0.5f),
                new Vector3(hw, 0f, depth),
                new Vector3(0f, -hh, depth * 0.8f),
                new Vector3(-hw, 0f, depth)
            };

            int[] tri = new int[]
            {
                // Double-sided triangles
                0, 1, 2,   0, 2, 4,   4, 2, 3,
                0, 2, 1,   0, 4, 2,   4, 3, 2
            };

            mesh.vertices = v;
            mesh.triangles = tri;
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Creates a stylized beard contour mesh following the lower jaw from ear to ear across the chin.
        /// </summary>
        public static Mesh CreateBeardMesh(float radiusX = 0.336f, float radiusZ = 0.316f, float height = 0.16f, int segments = 16)
        {
            Mesh mesh = new Mesh { name = "Bobblehead_Beard_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var triangles = new List<int>();

            for (int i = 0; i <= segments; i++)
            {
                float t = (float)i / segments;
                float angle = Mathf.Lerp(-0.45f * Mathf.PI, 0.45f * Mathf.PI, t);
                float sinA = Mathf.Sin(angle);
                float cosA = Mathf.Cos(angle);

                float x = radiusX * sinA;
                float z = radiusZ * cosA;

                float topY = Mathf.Lerp(-0.06f, -0.15f, cosA);
                float botY = topY - height * Mathf.Max(0.5f, cosA);

                vertices.Add(new Vector3(x * 1.01f, topY, z * 1.01f));
                normals.Add(new Vector3(sinA, 0.1f, cosA).normalized);

                vertices.Add(new Vector3(x * 1.02f, botY, z * 1.02f));
                normals.Add(new Vector3(sinA, -0.2f, cosA).normalized);
            }

            for (int i = 0; i < segments; i++)
            {
                int topCur = i * 2;
                int botCur = topCur + 1;
                int topNext = topCur + 2;
                int botNext = topCur + 3;

                // Outward winding
                triangles.Add(topCur);
                triangles.Add(botCur);
                triangles.Add(topNext);

                triangles.Add(topNext);
                triangles.Add(botCur);
                triangles.Add(botNext);

                // Double-sided guarantee
                triangles.Add(topCur);
                triangles.Add(topNext);
                triangles.Add(botCur);

                triangles.Add(topNext);
                triangles.Add(botNext);
                triangles.Add(botCur);
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }


        /// <summary>
        /// Creates a subtle stylized stubble / 5 o'clock shadow contour hugging the lower jaw and chin.
        /// </summary>
        public static Mesh CreateStubbleMesh(float radiusX = 0.333f, float radiusZ = 0.313f, float height = 0.13f, int segments = 14)
        {
            Mesh mesh = new Mesh { name = "Bobblehead_Stubble_Mesh" };
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var triangles = new List<int>();

            for (int i = 0; i <= segments; i++)
            {
                float t = (float)i / segments;
                float angle = Mathf.Lerp(-0.42f * Mathf.PI, 0.42f * Mathf.PI, t);
                float sinA = Mathf.Sin(angle);
                float cosA = Mathf.Cos(angle);

                float x = radiusX * sinA;
                float z = radiusZ * cosA;

                float topY = Mathf.Lerp(-0.07f, -0.14f, cosA);
                float botY = topY - height * Mathf.Max(0.45f, cosA);

                vertices.Add(new Vector3(x * 1.010f, topY, z * 1.010f));
                normals.Add(new Vector3(sinA, 0.1f, cosA).normalized);

                vertices.Add(new Vector3(x * 1.014f, botY, z * 1.014f));
                normals.Add(new Vector3(sinA, -0.1f, cosA).normalized);
            }

            for (int i = 0; i < segments; i++)
            {
                int topCur = i * 2;
                int botCur = topCur + 1;
                int topNext = topCur + 2;
                int botNext = topCur + 3;

                // Outward winding
                triangles.Add(topCur);
                triangles.Add(botCur);
                triangles.Add(topNext);

                triangles.Add(topNext);
                triangles.Add(botCur);
                triangles.Add(botNext);

                // Double-sided guarantee
                triangles.Add(topCur);
                triangles.Add(topNext);
                triangles.Add(botCur);

                triangles.Add(topNext);
                triangles.Add(botNext);
                triangles.Add(botCur);
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

    }
}
