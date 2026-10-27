using System;
using UnityEngine;

namespace MyVirtualCommunity.Player
{
    /// <summary>
    /// PlayerSpawnConfig defines the authoritative client spawn configuration.
    /// 
    /// MILESTONE 98 REQUIREMENT A:
    /// Temporary spawn point positioned at the corner of Del Porvenir and Blvd. Manuel Gómez Morín.
    /// Grounded on the pedestrian sidewalk, oriented toward the intersection/street.
    /// 
    /// FUTURE EXTENSION:
    /// When the geographic world slice expands to include the player's residence (e.g. Residencia Del Porvenir),
    /// simply update 'InitialSpawnPosition', 'InitialSpawnRotation', and 'SpawnLocationId' here
    /// to start each session inside the player's home residence without modifying locomotion code.
    /// </summary>
    [Serializable]
    public class PlayerSpawnConfig
    {
        [Header("Spawn Identity & Destination")]
        [Tooltip("Identifier of the spawn anchor")]
        public string spawnPointId = "spawn_corner_del_porvenir_gomez_morin";

        [Tooltip("World Core authoritative location ID corresponding to this spawn")]
        public string spawnLocationId = "street:blvd-gomez-morin";

        [Header("World-Space Transform")]
        [Tooltip("Walkable pedestrian surface position (Del Porvenir & Blvd. Gómez Morín corner)")]
        public Vector3 initialSpawnPosition = new Vector3(6.5f, 0.24f, 2.6f);

        [Tooltip("Facing orientation toward the intersection / street")]
        public Vector3 initialSpawnEulerAngles = new Vector3(0f, 110f, 0f);

        [Header("Documentation & Future Settings")]
        [Tooltip("Instructions for future slice expansion to home residence")]
        public string configurationNotes = "Del Porvenir / Blvd. Gómez Morín corner. When player residence is added to the world slice, update initialSpawnPosition to residence coordinates.";

        public Quaternion InitialSpawnRotation => Quaternion.Euler(initialSpawnEulerAngles);

        public static PlayerSpawnConfig CreateDefault()
        {
            return new PlayerSpawnConfig();
        }
    }
}
