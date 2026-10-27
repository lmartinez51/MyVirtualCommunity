using System;
using System.Collections.Generic;
using UnityEngine;

namespace MyVirtualCommunity.Player
{
    /// <summary>
    /// Configurable destination descriptor for quick travel / teleportation.
    /// Supports up to 6 slots, decoupled from locomotion code and World Core schema.
    /// </summary>
    [Serializable]
    public class QuickTravelDestination
    {
        public string destinationId;       // e.g. "dest:wing-spot"
        public string displayName;         // e.g. "Wing Spot"
        public string subtitle;            // e.g. "Comedor Principal"
        public string targetPlaceId;       // World Core location ID: "restaurant:wing-spot"
        public string interiorSpaceId;     // Optional interior ID: "interior:wing-spot-dining"
        public Vector3 arrivalPosition;    // Presentation coordinates in Unity
        public Vector3 arrivalRotation;    // Presentation euler rotation (facing target focal point)
        public bool isEstablishment;       // True if operating hours validation applies
        public bool isEnabled;             // Slot enabled flag (Slot 1 enabled, Slots 2-6 disabled)
    }

    /// <summary>
    /// QuickTravelConfig defines the configuration for the quick-travel / teleportation system.
    /// Up to 6 configurable slots, with Slot 1 (Wing Spot) enabled by default.
    /// </summary>
    [CreateAssetMenu(fileName = "QuickTravelConfig", menuName = "MyVirtualCommunity/Quick Travel Config")]
    public class QuickTravelConfig : ScriptableObject
    {
        public const int MAX_SLOTS = 6;

        [Header("Teleportation Presentation Settings")]
        [Tooltip("Total transition duration in seconds (0.5 to 1.2s)")]
        [Range(0.5f, 1.2f)]
        public float transitionDuration = 0.85f;

        [Header("Configured Travel Slots (Max 6)")]
        public List<QuickTravelDestination> destinations = new List<QuickTravelDestination>();

        public static QuickTravelConfig CreateDefault()
        {
            var config = ScriptableObject.CreateInstance<QuickTravelConfig>();
            config.destinations = new List<QuickTravelDestination>
            {
                // Slot 1: Wing Spot (Default: Enabled)
                new QuickTravelDestination
                {
                    destinationId = "dest:wing-spot",
                    displayName = "Wing Spot",
                    subtitle = "Comedor & Mostrador",
                    targetPlaceId = "restaurant:wing-spot",
                    interiorSpaceId = "interior:wing-spot-dining",
                    arrivalPosition = new Vector3(-12.5f, 0.24f, 8.5f),
                    arrivalRotation = new Vector3(0f, 0f, 0f), // Facing North toward service counter & Elena
                    isEstablishment = true,
                    isEnabled = true
                },
                // Slot 2: Pastelería La Tía Lupe (Default: Disabled / Reserved)
                new QuickTravelDestination
                {
                    destinationId = "dest:tia-lupe",
                    displayName = "Pastelería La Tía Lupe",
                    subtitle = "Próximamente",
                    targetPlaceId = "shop:pasteleria-tia-lupe",
                    interiorSpaceId = "",
                    arrivalPosition = new Vector3(1.5f, 0.24f, 6.0f),
                    arrivalRotation = new Vector3(0f, 0f, 0f),
                    isEstablishment = true,
                    isEnabled = false
                },
                // Slot 3: Residencia Del Porvenir (Default: Disabled / Reserved for future home)
                new QuickTravelDestination
                {
                    destinationId = "dest:residencia-del-porvenir",
                    displayName = "Residencia Del Porvenir",
                    subtitle = "Hogar (Próximamente)",
                    targetPlaceId = "residence:del-porvenir",
                    interiorSpaceId = "",
                    arrivalPosition = new Vector3(6.5f, 0.24f, 2.6f),
                    arrivalRotation = new Vector3(0f, 110f, 0f),
                    isEstablishment = false,
                    isEnabled = false
                },
                // Slot 4: Dollar 2 Go (Default: Disabled / Reserved)
                new QuickTravelDestination
                {
                    destinationId = "dest:dollar-2-go",
                    displayName = "Dollar 2 Go",
                    subtitle = "Próximamente",
                    targetPlaceId = "shop:dollar-2-go",
                    interiorSpaceId = "",
                    arrivalPosition = new Vector3(48.0f, 0.24f, 9.5f),
                    arrivalRotation = new Vector3(0f, 0f, 0f),
                    isEstablishment = true,
                    isEnabled = false
                },
                // Slot 5: Acabados HRC (Default: Disabled / Reserved)
                new QuickTravelDestination
                {
                    destinationId = "dest:acabados-hrc",
                    displayName = "Acabados HRC",
                    subtitle = "Próximamente",
                    targetPlaceId = "shop:acabados-hrc",
                    interiorSpaceId = "",
                    arrivalPosition = new Vector3(85.0f, 0.24f, 6.5f),
                    arrivalRotation = new Vector3(0f, 0f, 0f),
                    isEstablishment = true,
                    isEnabled = false
                },
                // Slot 6: Corporativo Arboleda (Default: Disabled / Reserved)
                new QuickTravelDestination
                {
                    destinationId = "dest:corporativo-arboleda",
                    displayName = "Corporativo Arboleda",
                    subtitle = "Próximamente",
                    targetPlaceId = "building:corporativo-arboleda",
                    interiorSpaceId = "",
                    arrivalPosition = new Vector3(131.5f, 0.24f, 6.5f),
                    arrivalRotation = new Vector3(0f, 0f, 0f),
                    isEstablishment = false,
                    isEnabled = false
                }
            };
            return config;
        }
    }
}
