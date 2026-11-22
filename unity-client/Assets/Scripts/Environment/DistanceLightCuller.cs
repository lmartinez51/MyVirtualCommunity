using System.Collections.Generic;
using UnityEngine;

namespace MyVirtualCommunity.Environment
{
    /// <summary>
    /// Thermal & Forward-Rendering GPU optimizer:
    /// Keeps at most MaxActiveLocalLights Point/Spot lights enabled within MaxLightDistance
    /// of the active camera (evaluated every 0.35s, zero per-frame allocations) and ensures
    /// local accent lights never cast expensive real-time shadow maps.
    /// </summary>
    public class DistanceLightCuller : MonoBehaviour
    {
        private const int MaxActiveLocalLights = 4;
        private const float MaxLightDistanceSqr = 26f * 26f;
        private const float PollIntervalSeconds = 0.35f;

        private readonly List<Light> localLights = new List<Light>();
        private readonly List<float> lightDistances = new List<float>();
        private Camera cachedCamera;
        private float pollTimer;

        public void CollectSceneLights(Transform root)
        {
            localLights.Clear();
            lightDistances.Clear();
            if (root == null) return;

            var lights = root.GetComponentsInChildren<Light>(true);
            for (int i = 0; i < lights.Length; i++)
            {
                var l = lights[i];
                if (l == null || l.type == LightType.Directional) continue;
                l.shadows = LightShadows.None;
                l.renderMode = LightRenderMode.Auto;
                localLights.Add(l);
                lightDistances.Add(float.MaxValue);
            }

            EvaluateActiveLights();
        }

        private void Update()
        {
            if (localLights.Count == 0) return;
            pollTimer += Time.deltaTime;
            if (pollTimer < PollIntervalSeconds) return;
            pollTimer = 0f;
            EvaluateActiveLights();
        }

        private void EvaluateActiveLights()
        {
            if (cachedCamera == null) cachedCamera = Camera.main;
            if (cachedCamera == null) return;

            Vector3 camPos = cachedCamera.transform.position;
            int count = localLights.Count;
            for (int i = 0; i < count; i++)
            {
                var l = localLights[i];
                if (l == null)
                {
                    lightDistances[i] = float.MaxValue;
                    continue;
                }
                Vector3 d = l.transform.position - camPos;
                lightDistances[i] = d.sqrMagnitude;
            }

            // Pick up to MaxActiveLocalLights closest lights within MaxLightDistanceSqr (O(N * K), zero alloc)
            for (int i = 0; i < count; i++)
            {
                if (localLights[i] != null) localLights[i].enabled = false;
            }

            for (int slot = 0; slot < MaxActiveLocalLights; slot++)
            {
                int bestIdx = -1;
                float bestDist = MaxLightDistanceSqr;
                for (int i = 0; i < count; i++)
                {
                    if (localLights[i] == null || localLights[i].enabled) continue;
                    if (lightDistances[i] < bestDist)
                    {
                        bestDist = lightDistances[i];
                        bestIdx = i;
                    }
                }
                if (bestIdx < 0) break;
                localLights[bestIdx].enabled = true;
            }
        }
    }
}
