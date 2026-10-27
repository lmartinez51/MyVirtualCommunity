using System.Collections.Generic;
using UnityEngine;

namespace MyVirtualCommunity.Environment
{
    /// <summary>
    /// Manages the activation and visibility of Wing Spot's interior text elements
    /// (such as hanging menu boards and interior signage).
    /// 
    /// Ensures interior text is active and readable when the player is inside the venue,
    /// but culled when the viewer is outside on the boulevard to prevent text shining
    /// through exterior walls or facades.
    /// </summary>
    [ExecuteAlways]
    public class WingSpotInteriorTextController : MonoBehaviour
    {
        [Header("Interior Bounds")]
        [SerializeField] private float minZ = 5.6f;
        [SerializeField] private float minX = -18.0f;
        [SerializeField] private float maxX = -3.0f;

        private List<GameObject> textObjects = new List<GameObject>();

        private void Awake()
        {
            RefreshTextTargets();
            UpdateVisibility(Vector3.zero);
        }

        private void OnEnable()
        {
            RefreshTextTargets();
            UpdateVisibility(Vector3.zero);
        }

        private void Start()
        {
            RefreshTextTargets();
            UpdateVisibility(Vector3.zero);
        }

        public void RefreshTextTargets()
        {
            textObjects.Clear();
            var textMeshes = GetComponentsInChildren<TextMesh>(true);
            foreach (var tm in textMeshes)
            {
                if (tm != null)
                {
                    textObjects.Add(tm.gameObject);
                }
            }
        }

        public void UpdateVisibility(Vector3 camPos)
        {
            if (textObjects == null || textObjects.Count == 0)
            {
                RefreshTextTargets();
            }

            bool isInside = (camPos.z >= minZ) && (camPos.x >= minX) && (camPos.x <= maxX);

            for (int i = 0; i < textObjects.Count; i++)
            {
                if (textObjects[i] != null && textObjects[i].activeSelf != isInside)
                {
                    textObjects[i].SetActive(isInside);
                }
            }
        }

        private void LateUpdate()
        {
            Camera cam = Camera.main;
            if (cam == null) cam = FindFirstObjectByType<Camera>();
            if (cam == null) return;

            UpdateVisibility(cam.transform.position);
        }
    }
}
