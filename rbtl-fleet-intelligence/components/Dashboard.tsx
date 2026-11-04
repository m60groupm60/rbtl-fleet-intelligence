
"use client";

import { useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase";
import type { ChangeEvent } from "react";

type Profile = {
  id: string;
  full_name: string | null;
  role: string;
};

type Row = Record<string, unknown>;

const text = (value: unknown): string =>
  value == null ? "" : String(value);

const regKey = (value: unknown): string =>
  text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");

const today = (): string => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  return `${part("year")}-${part("month")}-${part("day")}`;
};

export default function Dashboard({
  profile,
}: {
  profile: Profile;
}) {
  const db = useMemo(() => browserClient(), []);
  const manager = profile.role === "manager";

  const [tab, setTab] = useState("overview");
  const [dailyDate, setDailyDate] = useState(today());
  const [hiddenAlertTypes, setHiddenAlertTypes] = useState<string[]>([]);
  const [hideZeroAlertDrivers, setHideZeroAlertDrivers] = useState(false);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [vehicle, setVehicle] = useState("");
  const [driver, setDriver] = useState("");
  const [alertType, setAlertType] = useState("");
  const [result, setResult] = useState("");

  const [vehicles, setVehicles] = useState<Row[]>([]);
  const [assignments, setAssignments] = useState<Row[]>([]);
  const [inspections, setInspections] = useState<Row[]>([]);
  const [alerts, setAlerts] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Row[]>([]);
  const [overrides, setOverrides] = useState<Row[]>([]);
  const [roster, setRoster] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const requests = await Promise.all([
        db.from("vehicles")
          .select("*")
          .order("registration")
          .limit(1000),

        db.from("driver_assignments")
          .select("*")
          .gte("assignment_date", from)
          .lte("assignment_date", to)
          .limit(5000),

        db.from("dvic_inspections")
          .select("*")
          .gte("inspection_date", from)
          .lte("inspection_date", to)
          .limit(5000),

        db.from("netradyne_alerts")
          .select("*")
          .gte("alert_date", from)
          .lte("alert_date", to)
          .limit(5000),

        manager
          ? db.from("profiles")
              .select("id,full_name,role")
              .limit(1000)
          : Promise.resolve({ data: [], error: null }),

        manager
          ? db.from("netradyne_driver_overrides")
              .select("*")
              .gte("assignment_date", from)
              .lte("assignment_date", to)
              .limit(5000)
          : Promise.resolve({ data: [], error: null }),

        manager
          ? db.from("driver_assignments")
              .select("driver_name")
              .not("driver_name", "is", null)
              .order("assignment_date", { ascending: false })
              .limit(5000)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const tables = [
        "vehicles",
        "driver_assignments",
        "dvic_inspections",
        "netradyne_alerts",
        "profiles",
        "netradyne_driver_overrides",
        "driver_roster",
      ];

      const failures = requests
        .map((response, index) =>
          response.error
            ? `${tables[index]}: ${response.error.message}`
            : null
        )
        .filter(Boolean);

      if (failures.length) {
        setError(failures.join(" | "));
      }

      setVehicles(requests[0].data || []);
      setAssignments(requests[1].data || []);
      setInspections(requests[2].data || []);
      setAlerts(requests[3].data || []);
      setProfiles(requests[4].data || []);
      setOverrides(requests[5].data || []);

      setRoster(
        [
          ...new Set(
            (requests[6].data || [])
              .map((row) => text(row.driver_name).trim())
              .filter(
                (name) =>
                  name &&
                  name.toUpperCase() !== "UNMAPPED"
              )
          ),
        ].sort()
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load data"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [from, to]);

  const profileNames = useMemo(
    () =>
      new Map(
        profiles.map((p) => [
          text(p.id),
          text(p.full_name) || "Unnamed driver",
        ])
      ),
    [profiles]
  );

  const assignmentName = (row: Row): string => {
    const direct = text(row.driver_name).trim();

    if (direct && direct.toUpperCase() !== "UNMAPPED") {
      return direct;
    }

    return (
      profileNames.get(text(row.driver_id)) ||
      "Unmapped"
    );
  };

  const overrideName = (
    registration: string,
    date: string
  ): string =>
    text(
      overrides.find(
        (o) =>
          regKey(o.registration) === regKey(registration) &&
          text(o.assignment_date) === date
      )?.driver_name
    ).trim();

  const driverNames = (
    registration: string,
    date?: string
  ): string => {
    const names = assignments
      .filter(
        (a) =>
          regKey(a.registration) === regKey(registration) &&
          (!date || text(a.assignment_date) === date)
      )
      .map(assignmentName)
      .filter((name) => name !== "Unmapped");

    return [...new Set(names)].join(", ") || "—";
  };

  const alertDriverName = (row: Row): string =>
    overrideName(
      text(row.registration),
      text(row.alert_date)
    ) ||
    driverNames(
      text(row.registration),
      text(row.alert_date)
    );

  const driverOptions = [
    ...new Set(
      [
        ...roster,
        ...assignments.map(assignmentName),
        ...overrides.map((o) => text(o.driver_name)),
      ].filter(
        (name) =>
          name &&
          name !== "Unmapped" &&
          name !== "—"
      )
    ),
  ].sort();

  const matchesDriver = (row: Row): boolean =>
    !driver ||
    text(row.driver_id) === driver ||
    assignmentName(row) === driver ||
    text(row.inspector_id) === driver;

  const matchingAssignments = (
    registration: string,
    date: string
  ): Row[] =>
    assignments.filter(
      (a) =>
        regKey(a.registration) === regKey(registration) &&
        text(a.assignment_date) === date
    );

  const assignmentByInspectionId = useMemo(
    () =>
      new Map(
        assignments
          .filter((a) => text(a.inspection_id))
          .map((a) => [text(a.inspection_id), a])
      ),
    [assignments]
  );

  const inspectionDriver = (row: Row): string => {
    const match = assignmentByInspectionId.get(
      text(row.inspection_id)
    );

    return match
      ? assignmentName(match)
      : driverNames(
          text(row.registration),
          text(row.inspection_date)
        );
  };

  const matchesRelatedDriver = (
    row: Row,
    dateField: string
  ): boolean => {
    if (!driver) return true;

    if (text(row.driver_id) === driver) return true;

    const match = assignmentByInspectionId.get(
      text(row.inspection_id)
    );

    if (match) return matchesDriver(match);

    return matchingAssignments(
      text(row.registration),
      text(row[dateField])
    ).some(matchesDriver);
  };

  const registrations = useMemo(
    () =>
      [
        ...new Set(
          [
            ...vehicles,
            ...assignments,
            ...inspections,
            ...alerts,
          ]
            .map((row) => regKey(row.registration))
            .filter(Boolean)
        ),
      ].sort(),
    [vehicles, assignments, inspections, alerts]
  );

  const alertTypes = [
    ...new Set(
      alerts.map((a) => text(a.alert_type)).filter(Boolean)
    ),
  ].sort();

  const filteredAssignments = assignments.filter(
    (a) =>
      (!vehicle ||
        regKey(a.registration) === regKey(vehicle)) &&
      matchesDriver(a)
  );

  const filteredInspections = inspections.filter(
    (i) =>
      (!vehicle ||
        regKey(i.registration) === regKey(vehicle)) &&
      matchesRelatedDriver(i, "inspection_date") &&
      (!result || text(i.result) === result)
  );

  const filteredAlerts = alerts.filter((a) => {
    if (
      vehicle &&
      regKey(a.registration) !== regKey(vehicle)
    ) {
      return false;
    }

    if (alertType && text(a.alert_type) !== alertType) {
      return false;
    }

    if (!driver) return true;

    const manual = overrideName(
      text(a.registration),
      text(a.alert_date)
    );

    if (manual) return manual === driver;

    return matchesRelatedDriver(a, "alert_date");
  });

  const alertCount = filteredAlerts.reduce(
    (sum, a) => sum + (Number(a.event_count) || 0),
    0
  );

  const vanCount = new Set(
    [
      ...filteredAssignments,
      ...filteredInspections,
      ...filteredAlerts,
    ]
      .map((row) => regKey(row.registration))
      .filter(Boolean)
  ).size;

  const activeVehicleCount = new Set(
    [
      ...vehicles.filter((v) => v.active !== false),
      ...filteredAssignments,
      ...filteredInspections,
      ...filteredAlerts,
    ]
      .map((row) => regKey(row.registration))
      .filter(Boolean)
  ).size;

  const inspectionIds = new Set(
    filteredInspections
      .map((i) => text(i.inspection_id))
      .filter(Boolean)
  );

  const seenIds = new Set<string>();

  const assignmentInspections = filteredAssignments.filter(
    (a) => {
      const id = text(a.inspection_id).trim();

      if (!id) return true;

      if (inspectionIds.has(id) || seenIds.has(id)) {
        return false;
      }

      seenIds.add(id);
      return true;
    }
  );

  const dvicCount =
    filteredInspections.length +
    assignmentInspections.length;

  const unassignedAlerts = manager
    ? [
        ...new Map(
          alerts
            .filter(
              (a) =>
                !overrideName(
                  text(a.registration),
                  text(a.alert_date)
                ) &&
                driverNames(
                  text(a.registration),
                  text(a.alert_date)
                ) === "—"
            )
            .map((a) => [
              `${text(a.alert_date)}|${regKey(a.registration)}`,
              {
                date: text(a.alert_date),
                registration: regKey(a.registration),
              },
            ])
        ).values(),
      ]
        .map((item) => ({
          ...item,
          count: alerts
            .filter(
              (a) =>
                text(a.alert_date) === item.date &&
                regKey(a.registration) === item.registration
            )
            .reduce(
              (sum, a) =>
                sum + (Number(a.event_count) || 0),
              0
            ),
        }))
        .filter((item) => item.count > 0)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.registration.localeCompare(b.registration)
        )
    : [];

  async function saveOverride(
    date: string,
    registration: string,
    driverName: string
  ) {
    if (!manager || !driverName) return;

    const key = `${date}|${registration}`;

    setSavingKey(key);
    setSaveMessage("");

    try {
      const { error: saveError } = await db
        .from("netradyne_driver_overrides")
        .upsert(
          {
            assignment_date: date,
            registration: regKey(registration),
            driver_name: driverName,
            created_by: profile.id,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "assignment_date,registration",
          }
        );

      if (saveError) {
        setSaveMessage(`Error: ${saveError.message}`);
        return;
      }

      setSaveMessage(
        `Saved ${registration} for ${date}: ${driverName}`
      );

      await load();
    } catch (err) {
      setSaveMessage(
        err instanceof Error
          ? err.message
          : "Unable to save assignment"
      );
    } finally {
      setSavingKey("");
    }
  }

  const breakdown = registrations
    .filter(
      (reg) => !vehicle || reg === regKey(vehicle)
    )
    .map((registration) => {
      const relatedAssignments =
        filteredAssignments.filter(
          (a) =>
            regKey(a.registration) === registration
        );

      const relatedAlerts = filteredAlerts.filter(
        (a) =>
          regKey(a.registration) === registration
      );

      const names = [
        ...new Set(
          [
            ...relatedAssignments
              .map(assignmentName)
              .filter((name) => name !== "Unmapped"),

            ...relatedAlerts
              .map((a) =>
                overrideName(
                  registration,
                  text(a.alert_date)
                )
              )
              .filter(Boolean),
          ]
        ),
      ];

      return {
        registration,
        driver: names.join(", ") || "—",
        inspections:
          filteredInspections.filter(
            (i) =>
              regKey(i.registration) === registration
          ).length +
          assignmentInspections.filter(
            (a) =>
              regKey(a.registration) === registration
          ).length,
        alerts: relatedAlerts.reduce(
          (sum, a) =>
            sum + (Number(a.event_count) || 0),
          0
        ),
      };
    })
    .filter(
      (row) =>
        row.inspections > 0 ||
        row.alerts > 0 ||
        row.driver !== "—"
    )
    .sort((a, b) => b.alerts - a.alerts);

  // The daily report uses the same Supabase data and saved van/date overrides
  // as the existing Overview and Netradyne pages.
  const dailyAlertTypes = [
    ...new Set([
      "Low Impact", "Driver Initiated", "Potential Collision",
      "Sign Violations", "Traffic Light Violation", "U Turn",
      "Hard Braking", "Hard Turn", "Hard Acceleration",
      "Driver Distraction", "Following Distance", "Speeding Violations",
      "Seatbelt Compliance", "Camera Obstruction", "Collision Warning",
      "Backing",
      ...alerts.map((a) => text(a.alert_type).trim()).filter(Boolean),
    ]),
  ];
  const shownDailyTypes = dailyAlertTypes.filter(
    (type) => !hiddenAlertTypes.includes(type)
  );

  type DailyEntry = {
    date: string;
    registration: string;
    driverName: string;
    counts: Record<string, number>;
  };

  const dailyRowsMap = new Map<string, DailyEntry>();
  const getDailyRow = (date: string, registration: string, name: string) => {
    const key = [date, registration, name].join("|");
    let row = dailyRowsMap.get(key);
    if (!row) {
      row = { date, registration, driverName: name, counts: {} };
      dailyRowsMap.set(key, row);
    }
    return row;
  };

  // Include assigned drivers even if they triggered no alerts.
  assignments.forEach((a) => {
    const date = text(a.assignment_date);
    const registration = regKey(a.registration);
    const name = assignmentName(a);
    if (date !== dailyDate || !registration || name === "Unmapped") return;
    if (vehicle && registration !== regKey(vehicle)) return;
    if (driver && name !== driver) return;
    getDailyRow(date, registration, name);
  });

  // An override represents all alerts for the selected van on that date.
  overrides.forEach((o) => {
    const date = text(o.assignment_date);
    const registration = regKey(o.registration);
    const name = text(o.driver_name).trim();
    if (date !== dailyDate || !registration || !name) return;
    if (vehicle && registration !== regKey(vehicle)) return;
    if (driver && name !== driver) return;
    getDailyRow(date, registration, name);
  });

  alerts.forEach((a) => {
    const date = text(a.alert_date);
    const registration = regKey(a.registration);
    const type = text(a.alert_type).trim();
    if (date !== dailyDate || !registration || !type) return;
    if (vehicle && registration !== regKey(vehicle)) return;

    const manual = overrideName(registration, date);
    const known = [...new Set(
      matchingAssignments(registration, date)
        .map(assignmentName)
        .filter((name) => name && name !== "Unmapped")
    )];

    // If several drivers shared a van, do not guess who caused its alerts.
    const name = manual || (known.length === 1 ? known[0] : "Unassigned");
    if (driver && name !== driver) return;
    const row = getDailyRow(date, registration, name);
    row.counts[type] = (row.counts[type] || 0) + (Number(a.event_count) || 0);
  });

  const dailyCount = (row: DailyEntry) =>
    shownDailyTypes.reduce((sum, type) => sum + (row.counts[type] || 0), 0);

  const dailyRows = [...dailyRowsMap.values()]
    .filter((row) => !hideZeroAlertDrivers || dailyCount(row) > 0)
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      a.registration.localeCompare(b.registration) ||
      a.driverName.localeCompare(b.driverName)
    );

  const dailyTotal = dailyRows.reduce((sum, row) => sum + dailyCount(row), 0);

  function exportDailyCsv() {
    const headers = ["Date", "Registration", "Driver", ...shownDailyTypes, "Total"];
    const records = dailyRows.map((row) => [
      row.date, row.registration, row.driverName,
      ...shownDailyTypes.map((type) => String(row.counts[type] || 0)),
      String(dailyCount(row)),
    ]);
    const csv = [headers, ...records]
      .map((cells) => cells.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\\r\\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RBTL-Daily-Netradyne-${dailyDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function upload(
    event: ChangeEvent<HTMLInputElement>,
    kind: string
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage("Uploading…");

    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);

      const session = await db.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch("/api/import", {
        method: "POST",
        headers: token
          ? { Authorization: `Bearer ${token}` }
          : {},
        body: form,
      });

      const json = await response.json();

      setUploadMessage(
        json.error
          ? `Error: ${json.error}`
          : `Imported ${json.imported} records; skipped ${json.skipped}.`
      );

      if (response.ok) await load();
    } catch (err) {
      setUploadMessage(String(err));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function signOut() {
    await db.auth.signOut();
    window.location.href = "/login";
  }

  const navigation = [
    ["overview", "Overview"],
    ["vans", "Van breakdown"],
    ["inspections", "DVIC inspections"],
    ["alerts", "Netradyne alerts"],
    ["daily", "Daily alert breakdown"],
    ["assignments", "Driver assignments"],
    ...(manager ? [["import", "Import data"]] : []),
  ];

  const pageTitles: Record<string, string> = {
    overview: "Fleet overview",
    vans: "Van event breakdown",
    inspections: "Pre-trip DVIC",
    alerts: "Netradyne alerts",
    daily: "Daily alert breakdown",
    assignments: "Driver assignments",
    import: "Import data",
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          RBTL <span>FLEET INTELLIGENCE</span>
        </div>

        <div className="side-label">WORKSPACE</div>

        {navigation.map(([id, label]) => (
          <button
            key={id}
            className={
              "nav " + (tab === id ? "active" : "")
            }
            onClick={() => {
              if (id === "daily") {
                setDailyDate(from);
                setTo(from);
              }
              setTab(id);
            }}
          >
            {label}
          </button>
        ))}

        <div className="side-footer">
          <div>
            {profile.full_name || "RBTL User"}
          </div>
          <small>
            {manager ? "Manager" : "Driver"} account
          </small>
          <button onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="top">
          <div>
            <small>RBTL / OPERATIONS</small>
            <h1>{pageTitles[tab]}</h1>
          </div>

          <span className="role">
            {manager ? "MANAGER" : "DRIVER"} ACCESS
          </span>
        </header>

        <section className="filters">
          <label>
            From
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) =>
                setFrom(e.target.value)
              }
            />
          </label>

          <label>
            To
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) =>
                setTo(e.target.value)
              }
            />
          </label>

          <label>
            Vehicle
            <select
              value={vehicle}
              onChange={(e) =>
                setVehicle(e.target.value)
              }
            >
              <option value="">
                All vehicles
              </option>
              {registrations.map((reg) => (
                <option key={reg} value={reg}>
                  {reg}
                </option>
              ))}
            </select>
          </label>

          {manager && (
            <label>
              Driver
              <select
                value={driver}
                onChange={(e) =>
                  setDriver(e.target.value)
                }
              >
                <option value="">
                  All drivers
                </option>
                {driverOptions.map((name) => (
                  <option
                    key={name}
                    value={name}
                  >
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {tab === "alerts" && (
            <label>
              Alert type
              <select
                value={alertType}
                onChange={(e) =>
                  setAlertType(e.target.value)
                }
              >
                <option value="">
                  All alerts
                </option>
                {alertTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          )}

          {tab === "daily" && (
          <section className="panel">
            <div className="panel-head">
              <h2>Daily Netradyne alert breakdown</h2>
              <span>{dailyRows.length} van / driver rows</span>
            </div>
            <div style={{ padding: "20px", display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "end" }}>
              <label>
                Report date
                <input type="date" value={dailyDate} onChange={(e) => {
                  const date = e.target.value;
                  if (!date) return;
                  setDailyDate(date);
                  setFrom(date);
                  setTo(date);
                }} />
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input type="checkbox" checked={hideZeroAlertDrivers}
                  onChange={(e) => setHideZeroAlertDrivers(e.target.checked)} />
                Hide drivers with zero selected alerts
              </label>
              <button className="refresh" onClick={exportDailyCsv}>Export CSV</button>
            </div>
            <div style={{ padding: "0 20px 20px" }}>
              <strong>Alert columns</strong>
              <div style={{ display: "flex", gap: "10px", margin: "12px 0", flexWrap: "wrap" }}>
                <button className="refresh" onClick={() => setHiddenAlertTypes([])}>Show all</button>
                <button className="refresh" onClick={() => setHiddenAlertTypes([...dailyAlertTypes])}>Clear all</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
                {dailyAlertTypes.map((type) => (
                  <label key={type} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input type="checkbox" checked={!hiddenAlertTypes.includes(type)}
                      onChange={(e) => setHiddenAlertTypes((old) =>
                        e.target.checked ? old.filter((t) => t !== type) : [...old, type]
                      )} />
                    {type}
                  </label>
                ))}
              </div>
              <p className="muted">
                {dailyRows.length} rows · {dailyTotal} selected alerts.
                Unassigned alerts are kept separate when a van has multiple drivers and no manual override.
              </p>
            </div>
            <div className="table-wrap" style={{ overflowX: "auto" }}>
              <table style={{ minWidth: "max-content" }}>
                <thead><tr>
                  <th>Date</th><th>Registration</th><th>Driver</th>
                  {shownDailyTypes.map((type) => <th key={type}>{type}</th>)}
                  <th>Total</th>
                </tr></thead>
                <tbody>
                  {dailyRows.map((row) => (
                    <tr key={`${row.date}|${row.registration}|${row.driverName}`}>
                      <td>{row.date}</td>
                      <td><b>{row.registration}</b></td>
                      <td>{row.driverName}</td>
                      {shownDailyTypes.map((type) => (
                        <td key={type} style={{ textAlign: "center" }}>{row.counts[type] || 0}</td>
                      ))}
                      <td><b>{dailyCount(row)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!dailyRows.length && <p className="empty">No matching drivers or alerts for this date.</p>}
            </div>
          </section>
        )}

        {tab === "inspections" && (
            <label>
              Result
              <select
                value={result}
                onChange={(e) =>
                  setResult(e.target.value)
                }
              >
                <option value="">
                  All results
                </option>
                <option value="PASSED">
                  PASSED
                </option>
                <option value="FAILED">
                  FAILED
                </option>
              </select>
            </label>
          )}

          <button
            className="refresh"
            onClick={load}
          >
            Refresh
          </button>
        </section>

        {error && (
          <p className="error">{error}</p>
        )}

        {loading && (
          <p className="muted">
            Loading fleet data…
          </p>
        )}

        {manager &&
          (tab === "overview" ||
            tab === "alerts") &&
          unassignedAlerts.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2>
                  Unassigned Netradyne alerts
                </h2>
                <span>
                  {unassignedAlerts.length} van/date groups
                </span>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Registration</th>
                      <th>Alerts</th>
                      <th>
                        Assign all alerts to driver
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {unassignedAlerts.map((item) => (
                      <tr
                        key={
                          item.date +
                          "|" +
                          item.registration
                        }
                      >
                        <td>{item.date}</td>
                        <td>
                          <b>{item.registration}</b>
                        </td>
                        <td>{item.count}</td>
                        <td>
                          <select
                            defaultValue=""
                            disabled={!!savingKey}
                            onChange={(e) => {
                              if (e.target.value) {
                                void saveOverride(
                                  item.date,
                                  item.registration,
                                  e.target.value
                                );
                              }
                            }}
                          >
                            <option value="">
                              Select driver…
                            </option>

                            {driverOptions.map(
                              (name) => (
                                <option
                                  key={name}
                                  value={name}
                                >
                                  {name}
                                </option>
                              )
                            )}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {saveMessage && (
                <p className="muted">
                  {saveMessage}
                </p>
              )}
            </section>
          )}

        {(tab === "overview" ||
          tab === "vans") && (
          <>
            <section className="metrics">
              <div>
                <small>
                  ACTIVE VEHICLES
                </small>
                <strong>
                  {activeVehicleCount}
                </strong>
              </div>

              <div>
                <small>
                  DVIC INSPECTIONS
                </small>
                <strong>
                  {dvicCount}
                </strong>
              </div>

              <div>
                <small>
                  NETRADYNE EVENTS
                </small>
                <strong>
                  {alertCount}
                </strong>
              </div>

              <div>
                <small>
                  VANS WITH ACTIVITY
                </small>
                <strong>
                  {vanCount}
                </strong>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>
                  Vehicle performance
                </h2>
                <span>
                  Selected date range
                </span>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Registration</th>
                      <th>Driver</th>
                      <th>DVICs</th>
                      <th>Alerts</th>
                    </tr>
                  </thead>

                  <tbody>
                    {breakdown.map((row) => (
                      <tr
                        key={row.registration}
                      >
                        <td>
                          <b>
                            {row.registration}
                          </b>
                        </td>
                        <td>
                          {row.driver}
                        </td>
                        <td>
                          {row.inspections}
                        </td>
                        <td>
                          <span
                            className={
                              row.alerts
                                ? "pill danger"
                                : "pill"
                            }
                          >
                            {row.alerts}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!breakdown.length && (
                  <p className="empty">
                    No matching records.
                  </p>
                )}
              </div>
            </section>
          </>
        )}

        {tab === "inspections" && (
          <section className="panel">
            <div className="panel-head">
              <h2>
                Inspection history
              </h2>
              <span>
                {dvicCount} records
              </span>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "Date",
                      "Time",
                      "Registration",
                      "Driver",
                      "Inspector ID",
                      "Result",
                      "Inspection ID",
                    ].map((heading) => (
                      <th key={heading}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {!result &&
                    assignmentInspections.map(
                      (a) => (
                        <tr
                          key={
                            "assignment-" +
                            text(a.id)
                          }
                        >
                          <td>
                            {text(a.assignment_date)}
                          </td>
                          <td>
                            {text(a.inspection_time)}
                          </td>
                          <td>
                            {text(a.registration)}
                          </td>
                          <td>
                            {assignmentName(a)}
                          </td>
                          <td>
                            {text(a.inspector_id)}
                          </td>
                          <td>—</td>
                          <td>
                            {text(a.inspection_id)}
                          </td>
                        </tr>
                      )
                    )}

                  {filteredInspections.map(
                    (i) => (
                      <tr
                        key={
                          "inspection-" +
                          text(i.id)
                        }
                      >
                        <td>
                          {text(i.inspection_date)}
                        </td>
                        <td>
                          {text(i.inspection_time)}
                        </td>
                        <td>
                          {text(i.registration)}
                        </td>
                        <td>
                          {inspectionDriver(i)}
                        </td>
                        <td>
                          {text(i.inspector_id)}
                        </td>
                        <td>
                          {text(i.result)}
                        </td>
                        <td>
                          {text(i.inspection_id)}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {manager &&
          tab === "alerts" &&
          overrides.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2>
                  Manual Netradyne assignments
                </h2>
                <span>
                  Change driver
                </span>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Registration</th>
                      <th>
                        Assigned driver
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {overrides.map((o) => (
                      <tr
                        key={text(o.id)}
                      >
                        <td>
                          {text(o.assignment_date)}
                        </td>
                        <td>
                          {text(o.registration)}
                        </td>
                        <td>
                          <select
                            value={text(
                              o.driver_name
                            )}
                            disabled={!!savingKey}
                            onChange={(e) =>
                              void saveOverride(
                                text(
                                  o.assignment_date
                                ),
                                text(
                                  o.registration
                                ),
                                e.target.value
                              )
                            }
                          >
                            {driverOptions.map(
                              (name) => (
                                <option
                                  key={name}
                                  value={name}
                                >
                                  {name}
                                </option>
                              )
                            )}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        {tab === "alerts" && (
          <section className="panel">
            <div className="panel-head">
              <h2>
                Alert history
              </h2>
              <span>
                {alertCount} events
              </span>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "Date",
                      "Vehicle",
                      "Driver",
                      "Alert type",
                      "Description",
                      "Severity",
                      "Count",
                    ].map((heading) => (
                      <th key={heading}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredAlerts.map(
                    (a) => (
                      <tr
                        key={text(a.id)}
                      >
                        <td>
                          {text(a.alert_date)}
                        </td>
                        <td>
                          {text(a.registration)}
                        </td>
                        <td>
                          {alertDriverName(a)}
                        </td>
                        <td>
                          {text(a.alert_type)}
                        </td>
                        <td>
                          {text(a.description)}
                        </td>
                        <td>
                          {text(a.severity)}
                        </td>
                        <td>
                          {text(a.event_count)}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "assignments" && (
          <section className="panel">
            <div className="panel-head">
              <h2>
                Vehicle assignments
              </h2>
              <span>
                {filteredAssignments.length} records
              </span>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "Date",
                      "Registration",
                      "Driver",
                      "Inspector ID",
                    ].map((heading) => (
                      <th key={heading}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredAssignments.map(
                    (a) => (
                      <tr
                        key={text(a.id)}
                      >
                        <td>
                          {text(a.assignment_date)}
                        </td>
                        <td>
                          {text(a.registration)}
                        </td>
                        <td>
                          {assignmentName(a)}
                        </td>
                        <td>
                          {text(a.inspector_id)}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "import" &&
          manager && (
            <section className="panel import">
              <h2>
                Import Google Sheets CSV exports
              </h2>

              <p>
                Export each sheet as CSV, then
                upload it here. Importing does
                not delete existing data.
              </p>

              {[
                ["vehicles", "Vehicle Map"],
                [
                  "inspections",
                  "Driver Assignments (DVIC)",
                ],
                [
                  "alerts",
                  "Netradyne Data",
                ],
                [
                  "assignments",
                  "Driver assignments mapping",
                ],
              ].map(([kind, label]) => (
                <label
                  key={kind}
                  className="upload"
                >
                  {label}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={uploading}
                    onChange={(e) =>
                      upload(e, kind)
                    }
                  />
                </label>
              ))}

              <p className="muted">
                Driver accounts must be linked
                to their inspector IDs before
                their records become visible.
              </p>

              <p>
                {uploadMessage}
              </p>
            </section>
          )}
      </main>
    </div>
  );
}
