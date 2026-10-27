using System;
using System.Collections.Generic;
using UnityEngine;

namespace MyVirtualCommunity.Core
{
    /// <summary>
    /// Operational status of a customer-facing business establishment.
    /// </summary>
    public enum BusinessOperationalState
    {
        Open,
        ClosingSoon,
        Closed
    }

    /// <summary>
    /// Operating daily hours definition.
    /// </summary>
    [System.Serializable]
    public class BusinessOperatingHours
    {
        public int openHour = 9;
        public int openMinute = 0;
        public int closeHour = 18;
        public int closeMinute = 0;

        public BusinessOperatingHours() { }
        public BusinessOperatingHours(int oH, int oM, int cH, int cM)
        {
            openHour = oH;
            openMinute = oM;
            closeHour = cH;
            closeMinute = cM;
        }
    }

    /// <summary>
    /// Business schedule configuration.
    /// </summary>
    [System.Serializable]
    public class BusinessScheduleInfo
    {
        public string businessId;
        public string name;
        public string timeZone = "America/Ciudad_Juarez";
        public int[] operatingDays = new int[] { 1, 2, 3, 4, 5, 6 }; // Mon-Sat
        public BusinessOperatingHours hours = new BusinessOperatingHours(9, 0, 18, 0);
        public int lastEntryCutoffMinutes = 15;

        public BusinessScheduleInfo(string id, string name)
        {
            this.businessId = id;
            this.name = name;
        }
    }

    /// <summary>
    /// Client-side authoritative schedule registry and admission evaluator.
    /// Synchronized with World Core schema v19 and business schedule domain rules.
    /// </summary>
    public static class BusinessScheduleRegistry
    {
        private static readonly Dictionary<string, BusinessScheduleInfo> registry = new Dictionary<string, BusinessScheduleInfo>()
        {
            { "restaurant:wing-spot", new BusinessScheduleInfo("restaurant:wing-spot", "Wing Spot Gómez Morín") },
            { "restaurant:pasteleria-tia-lupe", new BusinessScheduleInfo("restaurant:pasteleria-tia-lupe", "Pastelerías La Tía Lupe") }
        };

        /// <summary>
        /// Optional delegate provider for authoritative simulation world time.
        /// Registered by WorldCoreClient to ensure client presentation and access logic
        /// evaluate World Core simulation clock rather than local computer wall clock.
        /// </summary>
        public static Func<DateTime> AuthoritativeTimeProvider = null;

        /// <summary>
        /// Resolves the current authoritative UTC time: uses WorldCoreClient simulation time if available,
        /// falling back to DateTime.UtcNow only in standalone offline mode.
        /// </summary>
        public static DateTime GetAuthoritativeTimeUtc()
        {
            if (AuthoritativeTimeProvider != null)
            {
                try
                {
                    return AuthoritativeTimeProvider();
                }
                catch
                {
                    // Fall back to DateTime.UtcNow if delegate fails
                }
            }
            return DateTime.UtcNow;
        }

        public static BusinessScheduleInfo GetSchedule(string businessId)
        {
            if (string.IsNullOrEmpty(businessId)) return null;
            registry.TryGetValue(businessId, out var schedule);
            return schedule;
        }

        public static void RegisterSchedule(BusinessScheduleInfo schedule)
        {
            if (schedule != null && !string.IsNullOrEmpty(schedule.businessId))
            {
                registry[schedule.businessId] = schedule;
            }
        }

        /// <summary>
        /// Converts UTC time to Ciudad Juárez local civil time.
        /// Handles IANA 'America/Ciudad_Juarez' and Windows 'Mountain Standard Time' (UTC-6 summer / UTC-7 winter).
        /// </summary>
        public static DateTime ConvertToLocalBusinessTime(DateTime utcTime, string timeZoneId)
        {
            DateTime safeUtc = utcTime.Kind == DateTimeKind.Utc
                ? utcTime
                : DateTime.SpecifyKind(utcTime, DateTimeKind.Utc);

            if (timeZoneId == "America/Ciudad_Juarez")
            {
                // 1. Try IANA identifier directly (.NET 6+ ICU support)
                try
                {
                    TimeZoneInfo tzi = TimeZoneInfo.FindSystemTimeZoneById("America/Ciudad_Juarez");
                    return TimeZoneInfo.ConvertTimeFromUtc(safeUtc, tzi);
                }
                catch { }

                // 2. Try Windows Mountain Standard Time (El Paso / Ciudad Juárez northern border time)
                try
                {
                    TimeZoneInfo tziMtn = TimeZoneInfo.FindSystemTimeZoneById("Mountain Standard Time");
                    return TimeZoneInfo.ConvertTimeFromUtc(safeUtc, tziMtn);
                }
                catch { }

                // 3. Fallback to Central Standard Time (Mexico) or raw UTC-6
                try
                {
                    TimeZoneInfo tziMex = TimeZoneInfo.FindSystemTimeZoneById("Central Standard Time (Mexico)");
                    return TimeZoneInfo.ConvertTimeFromUtc(safeUtc, tziMex);
                }
                catch
                {
                    return safeUtc.AddHours(-6);
                }
            }

            try
            {
                TimeZoneInfo tzi = TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
                return TimeZoneInfo.ConvertTimeFromUtc(safeUtc, tzi);
            }
            catch
            {
                return safeUtc.AddHours(-6);
            }
        }

        /// <summary>
        /// Evaluates business operational status using authoritative world time.
        /// </summary>
        public static BusinessOperationalState EvaluateStatus(string businessId)
        {
            return EvaluateStatus(businessId, GetAuthoritativeTimeUtc());
        }

        /// <summary>
        /// Evaluates business operational status at a specific time.
        /// </summary>
        public static BusinessOperationalState EvaluateStatus(string businessId, DateTime utcTime)
        {
            var schedule = GetSchedule(businessId);
            if (schedule == null) return BusinessOperationalState.Open;

            DateTime localTime = ConvertToLocalBusinessTime(utcTime, schedule.timeZone);
            int dayOfWeek = (int)localTime.DayOfWeek; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

            bool isOperatingDay = false;
            if (schedule.operatingDays != null)
            {
                for (int i = 0; i < schedule.operatingDays.Length; i++)
                {
                    if (schedule.operatingDays[i] == dayOfWeek)
                    {
                        isOperatingDay = true;
                        break;
                    }
                }
            }
            if (!isOperatingDay) return BusinessOperationalState.Closed;

            int timeOfDayMinutes = localTime.Hour * 60 + localTime.Minute;
            int openMinutes = schedule.hours.openHour * 60 + schedule.hours.openMinute;
            int closeMinutes = schedule.hours.closeHour * 60 + schedule.hours.closeMinute;
            int cutoffMinutes = closeMinutes - schedule.lastEntryCutoffMinutes;

            if (timeOfDayMinutes < openMinutes || timeOfDayMinutes >= closeMinutes)
            {
                return BusinessOperationalState.Closed;
            }
            if (timeOfDayMinutes >= cutoffMinutes && timeOfDayMinutes < closeMinutes)
            {
                return BusinessOperationalState.ClosingSoon;
            }
            return BusinessOperationalState.Open;
        }

        /// <summary>
        /// Evaluates whether a customer can be admitted into the business establishment
        /// using authoritative world time.
        /// </summary>
        public static bool CanAdmitCustomer(string businessId, out string rejectionReason)
        {
            return CanAdmitCustomer(businessId, GetAuthoritativeTimeUtc(), out rejectionReason);
        }

        /// <summary>
        /// Evaluates whether a customer can be admitted into the business establishment.
        /// Exits are not evaluated here as they are always permitted.
        /// </summary>
        public static bool CanAdmitCustomer(string businessId, DateTime utcTime, out string rejectionReason)
        {
            var schedule = GetSchedule(businessId);
            if (schedule == null)
            {
                rejectionReason = null;
                return true;
            }

            var status = EvaluateStatus(businessId, utcTime);
            string closeStr = $"{schedule.hours.closeHour:D2}:{schedule.hours.closeMinute:D2}";
            string openStr = $"{schedule.hours.openHour:D2}:{schedule.hours.openMinute:D2}";

            if (status == BusinessOperationalState.Open)
            {
                rejectionReason = null;
                return true;
            }

            if (status == BusinessOperationalState.ClosingSoon)
            {
                rejectionReason = $"El establecimiento está por cerrar y ya no acepta nuevos clientes. Cierre: {closeStr}.";
                return false;
            }

            rejectionReason = $"El establecimiento está cerrado. No se permite el ingreso. Horario: {openStr} - {closeStr}.";
            return false;
        }
    }
}
