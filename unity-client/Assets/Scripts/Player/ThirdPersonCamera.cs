using UnityEngine;
using MyVirtualCommunity.UI;

namespace MyVirtualCommunity.Player
{
    public enum CameraPreset
    {
        ThirdPerson,
        FirstPerson,
        FrontView,
        SideView,
        TopDown
    }

    /// <summary>
    /// ThirdPersonCamera provides smooth, rock-solid orbital camera controls and predefined view presets:
    /// - Third Person (default)
    /// - First Person (eye level forward)
    /// - Front View (facing character front)
    /// - Side View (profile perspective)
    /// - Top-Down (bird's-eye tactical perspective)
    /// 
    /// Uses pure quaternion trigonometry with zero LookAt singularities.
    /// Strictly presentation-only: never modifies player transform or World Core state.
    /// </summary>
    public class ThirdPersonCamera : MonoBehaviour
    {
        [Header("Target & Framing")]
        [SerializeField] private Transform target;
        [SerializeField] private Vector3 targetOffset = new Vector3(0f, 1.4f, 0f);

        [Header("Distance & Orbit")]
        [SerializeField] private float defaultDistance = 4.2f;
        [SerializeField] private float minDistance = 0.35f;
        [SerializeField] private float maxDistance = 12.0f;
        [SerializeField] private float mouseSensitivity = 2.5f;

        [Header("Pitch Limits")]
        [SerializeField] private float minPitch = -15f;
        [SerializeField] private float maxPitch = 85f;

        [Header("Collision Avoidance")]
        [SerializeField] private LayerMask collisionLayers;

        public CameraPreset ActivePreset { get; private set; } = CameraPreset.ThirdPerson;

        private float currentYaw = 0f;
        private float currentPitch = 12f;
        private float currentDistance;

        private float targetYaw = 0f;
        private float targetPitch = 12f;
        private float targetDist = 4.2f;
        private Vector3 desiredOffset = new Vector3(0f, 1.4f, 0f);
        private bool isTransitioning = false;

        private void Start()
        {
            currentDistance = defaultDistance;
            targetDist = defaultDistance;
            desiredOffset = targetOffset;

            if (collisionLayers.value == 0)
            {
                collisionLayers = Physics.DefaultRaycastLayers;
            }
            // Exclude Ignore Raycast (Layer 2) from collision
            collisionLayers &= ~(1 << 2);

            if (target == null)
            {
                var player = FindFirstObjectByType<PlayerController>();
                if (player != null)
                {
                    target = player.transform;
                }
            }

            var cam = GetComponent<Camera>();
            if (cam != null)
            {
                cam.nearClipPlane = 0.05f;
            }

            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }

        public void ApplyPreset(CameraPreset preset)
        {
            ActivePreset = preset;
            isTransitioning = true;

            float playerYaw = target != null ? target.eulerAngles.y : 0f;

            switch (preset)
            {
                case CameraPreset.ThirdPerson:
                    desiredOffset = new Vector3(0f, 1.4f, 0f);
                    targetPitch = 12f;
                    targetDist = 4.2f;
                    targetYaw = playerYaw;
                    break;

                case CameraPreset.FirstPerson:
                    desiredOffset = new Vector3(0f, 1.55f, 0.22f); // Eye height, forward clear of brow
                    targetPitch = 0f;
                    targetDist = 0.05f;
                    targetYaw = playerYaw;
                    break;

                case CameraPreset.FrontView:
                    desiredOffset = new Vector3(0f, 1.30f, 0f);
                    targetPitch = 6f;
                    targetDist = 3.2f;
                    targetYaw = playerYaw + 180f;
                    break;

                case CameraPreset.SideView:
                    desiredOffset = new Vector3(0f, 1.30f, 0f);
                    targetPitch = 8f;
                    targetDist = 3.5f;
                    targetYaw = playerYaw + 90f;
                    break;

                case CameraPreset.TopDown:
                    desiredOffset = new Vector3(0f, 0.8f, 0f);
                    targetPitch = 82f;
                    targetDist = 9.5f;
                    targetYaw = playerYaw;
                    break;
            }
        }

        public void ResetCamera()
        {
            ApplyPreset(CameraPreset.ThirdPerson);
        }

        private void LateUpdate()
        {
            bool isModalActive = ProductHudController.Instance != null &&
                (ProductHudController.Instance.IsMenuModalOpen ||
                 ProductHudController.Instance.IsPauseMenuOpen ||
                 ProductHudController.Instance.IsExitConfirmOpen);

            bool isPointerOverUI = ProductHudController.Instance != null && ProductHudController.Instance.IsMouseOverUI();

            if (isModalActive)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
            else
            {
                // [Alt] or [Tab] key freely toggles cursor release/lock mode
                if (Input.GetKeyDown(KeyCode.LeftAlt) || Input.GetKeyDown(KeyCode.RightAlt) || Input.GetKeyDown(KeyCode.Tab))
                {
                    if (Cursor.lockState == CursorLockMode.Locked)
                    {
                        Cursor.lockState = CursorLockMode.None;
                        Cursor.visible = true;
                    }
                    else
                    {
                        Cursor.lockState = CursorLockMode.Locked;
                        Cursor.visible = false;
                    }
                }
                // Clicking on 3D scene (NOT over UI buttons) re-locks cursor for immersive look-around
                else if (Input.GetMouseButtonDown(0) && !isPointerOverUI)
                {
                    Cursor.lockState = CursorLockMode.Locked;
                    Cursor.visible = false;
                }
            }

            if (target == null)
            {
                var p = FindFirstObjectByType<PlayerController>();
                if (p != null) target = p.transform;
                else return;
            }

            // Mouse orbit: active when cursor locked or holding right mouse button, but NOT when a modal is open or when cursor is free (unless RMB held)
            if (!isModalActive && (Cursor.lockState == CursorLockMode.Locked || Input.GetMouseButton(1)))
            {
                float mouseX = Input.GetAxis("Mouse X") * mouseSensitivity;
                float mouseY = Input.GetAxis("Mouse Y") * mouseSensitivity;

                if (Mathf.Abs(mouseX) > 0.01f || Mathf.Abs(mouseY) > 0.01f)
                {
                    isTransitioning = false;
                    currentYaw += mouseX;
                    currentPitch -= mouseY;
                    currentPitch = Mathf.Clamp(currentPitch, minPitch, maxPitch);
                }
            }

            // Smoothly interpolate towards preset target framing if transitioning
            if (isTransitioning)
            {
                currentYaw = Mathf.LerpAngle(currentYaw, targetYaw, Time.deltaTime * 7.5f);
                currentPitch = Mathf.Lerp(currentPitch, targetPitch, Time.deltaTime * 7.5f);
                targetOffset = Vector3.Lerp(targetOffset, desiredOffset, Time.deltaTime * 7.5f);

                if (Mathf.Abs(Mathf.DeltaAngle(currentYaw, targetYaw)) < 0.2f &&
                    Mathf.Abs(currentPitch - targetPitch) < 0.2f &&
                    Vector3.Distance(targetOffset, desiredOffset) < 0.02f)
                {
                    currentYaw = targetYaw;
                    currentPitch = targetPitch;
                    targetOffset = desiredOffset;
                    isTransitioning = false;
                }
            }
            else
            {
                targetOffset = Vector3.Lerp(targetOffset, desiredOffset, Time.deltaTime * 7.5f);
            }

            // 1. Compute mathematically exact unit orientation quaternion
            Quaternion rot = Quaternion.Euler(currentPitch, currentYaw, 0f);
            Vector3 focusPoint = target.position + targetOffset;

            // 2. Pure unit backwards vector (guaranteed normalized by definition)
            Vector3 backDir = rot * Vector3.back;

            // 3. Environment collision raycast (skipped in first-person mode to prevent near clipping)
            float desiredDist = targetDist;
            if (ActivePreset != CameraPreset.FirstPerson)
            {
                if (Physics.Raycast(focusPoint, backDir, out RaycastHit hit, targetDist, collisionLayers))
                {
                    desiredDist = Mathf.Clamp(hit.distance - 0.25f, minDistance, maxDistance);
                }
            }
            else
            {
                desiredDist = 0.05f;
            }

            currentDistance = Mathf.Lerp(currentDistance, desiredDist, Time.deltaTime * 9.0f);

            // 4. Exact direct transform assignment - zero LookAt, zero singularities
            transform.position = focusPoint + backDir * currentDistance;
            transform.rotation = rot;
        }

        public void ResetCameraView(float yaw, float pitch)
        {
            currentYaw = yaw;
            currentPitch = Mathf.Clamp(pitch, minPitch, maxPitch);
            currentDistance = defaultDistance;
            targetDist = defaultDistance;
            isTransitioning = false;

            if (target != null)
            {
                Quaternion rot = Quaternion.Euler(currentPitch, currentYaw, 0f);
                Vector3 focusPoint = target.position + targetOffset;
                Vector3 backDir = rot * Vector3.back;
                transform.position = focusPoint + backDir * currentDistance;
                transform.rotation = rot;
            }
        }

        public void SetTarget(Transform newTarget)
        {
            target = newTarget;
        }
    }
}
