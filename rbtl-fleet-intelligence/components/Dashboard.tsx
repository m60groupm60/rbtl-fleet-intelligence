
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

function getDriverName(
  assignment: Row,
  profileNames: Map<string, string>
): string {
  const direct = text(assignment.driver_name).trim();

  if (direct && direct.toUpperCase() !== "UNMAPPED") {
    return direct;
  }

  const linked = profileNames.get(text(assignment.driver_id));

  return linked || "Unmapped";
}

export default function Dashboard({
  profile,
}: {
  profile: Profile;
}) {
  const db = useMemo(() => browserClient(), []);
  const manager = profile.role === "manager";

  const [tab, setTab] = useState("overview");
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

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
      ]);

      const tables = [
        "vehicles",
        "driver_assignments",
        "dvic_inspections",
        "netradyne_alerts",
        "profiles",
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

  const assignmentName = (row: Row) =>
    getDriverName(row, profileNames);

  const matchesDriver = (row: Row) =>
    !driver ||
    text(row.driver_id) === driver ||
    assignmentName(row) === driver ||
    text(row.inspector_id) === driver;

  const matchingAssignments = (
    registration: string,
    date: string
  ) =>
    assignments.filter(
      (a) =>
        regKey(a.registration) === regKey(registration) &&
        text(a.assignment_date) === date
    );

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

  const assignmentByInspectionId = useMemo(
    () =>
      new Map(
        assignments
          .filter((a) => text(a.inspection_id))
          .map((a) => [text(a.inspection_id), a])
      ),
    [assignments]
  );

  const inspectionDriver = (row: Row) => {
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
  ) => {
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

  const driverOptions = [
    ...new Set(
      assignments
        .map(assignmentName)
        .filter((name) => name !== "Unmapped")
    ),
  ].sort();

  const alertTypes = [
    ...new Set(alerts.map((a) => text(a.alert_type))),
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

  const filteredAlerts = alerts.filter(
    (a) =>
      (!vehicle ||
        regKey(a.registration) === regKey(vehicle)) &&
      matchesRelatedDriver(a, "alert_date") &&
      (!alertType || text(a.alert_type) === alertType)
  );

  const alertCount = filteredAlerts.reduce(
    (sum, a) => sum + (Number(a.event_count) || 0),
    0
  );

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

  const visibleAssignmentInspections = result
    ? []
    : assignmentInspections;

  const dvicCount =
    filteredInspections.length +
    visibleAssignmentInspections.length;

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

  const breakdown = registrations
    .filter((reg) => !vehicle || reg === regKey(vehicle))
    .map((registration) => {
      const relatedAssignments =
        filteredAssignments.filter(
          (a) => regKey(a.registration) === registration
        );

      const relatedInspections =
        filteredInspections.filter(
          (i) => regKey(i.registration) === registration
        );

      const relatedAssignmentInspections =
        visibleAssignmentInspections.filter(
          (a) => regKey(a.registration) === registration
        );

      const relatedAlerts = filteredAlerts.filter(
        (a) => regKey(a.registration) === registration
      );

      return {
        registration,
        driver:
          [
            ...new Set(
              relatedAssignments
                .map(assignmentName)
                .filter((name) => name !== "Unmapped")
            ),
          ].join(", ") || "—",
        inspections:
          relatedInspections.length +
          relatedAssignmentInspections.length,
        alerts: relatedAlerts.reduce(
          (sum, a) => sum + (Number(a.event_count) || 0),
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
    ["assignments", "Driver assignments"],
    ...(manager ? [["import", "Import data"]] : []),
  ];

  const pageTitles: Record<string, string> = {
    overview: "Fleet overview",
    vans: "Van event breakdown",
    inspections: "Pre-trip DVIC",
    alerts: "Netradyne alerts",
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
            className={"nav " + (tab === id ? "active" : "")}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}

        <div className="side-footer">
          <div>{profile.full_name || "RBTL User"}</div>
          <small>{manager ? "Manager" : "Driver"} account</small>
          <button onClick={signOut}>Sign out</button>
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
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>

          <label>
            To
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>

          <label>
            Vehicle
            <select
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
            >
              <option value="">All vehicles</option>
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
                onChange={(e) => setDriver(e.target.value)}
              >
                <option value="">All drivers</option>
                {driverOptions.map((name) => (
                  <option key={name} value={name}>
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
                onChange={(e) => setAlertType(e.target.value)}
              >
                <option value="">All alerts</option>
                {alertTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
          )}

          {tab === "inspections" && (
            <label>
              Result
              <select
                value={result}
                onChange={(e) => setResult(e.target.value)}
              >
                <option value="">All results</option>
                <option value="PASSED">PASSED</option>
                <option value="FAILED">FAILED</option>
              </select>
            </label>
          )}

          <button className="refresh" onClick={load}>
            Refresh
          </button>
        </section>

        {error && <p className="error">{error}</p>}
        {loading && (
          <p className="muted">Loading fleet data…</p>
        )}

        {(tab === "overview" || tab === "vans") && (
          <>
            <section className="metrics">
              <div>
                <small>ACTIVE VEHICLES</small>
                <strong>{activeVehicleCount}</strong>
              </div>
              <div>
                <small>DVIC INSPECTIONS</small>
                <strong>{dvicCount}</strong>
              </div>
              <div>
                <small>NETRADYNE EVENTS</small>
                <strong>{alertCount}</strong>
              </div>
              <div>
                <small>VANS WITH ACTIVITY</small>
                <strong>{vanCount}</strong>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>Vehicle performance</h2>
                <span>Selected date range</span>
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
                      <tr key={row.registration}>
                        <td><b>{row.registration}</b></td>
                        <td>{row.driver}</td>
                        <td>{row.inspections}</td>
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
              <h2>Inspection history</h2>
              <span>{dvicCount} records</span>
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
                      <th key={heading}>{heading}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {visibleAssignmentInspections.map((a) => (
                    <tr key={"assignment-" + text(a.id)}>
                      <td>{text(a.assignment_date)}</td>
                      <td>{text(a.inspection_time)}</td>
                      <td>{text(a.registration)}</td>
                      <td>{assignmentName(a)}</td>
                      <td>{text(a.inspector_id)}</td>
                      <td>—</td>
                      <td>{text(a.inspection_id)}</td>
                    </tr>
                  ))}

                  {filteredInspections.map((i) => (
                    <tr key={"inspection-" + text(i.id)}>
                      <td>{text(i.inspection_date)}</td>
                      <td>{text(i.inspection_time)}</td>
                      <td>{text(i.registration)}</td>
                      <td>{inspectionDriver(i)}</td>
                      <td>{text(i.inspector_id)}</td>
                      <td>{text(i.result)}</td>
                      <td>{text(i.inspection_id)}</td>
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
              <h2>Alert history</h2>
              <span>{alertCount} events</span>
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
                      <th key={heading}>{heading}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredAlerts.map((a) => (
                    <tr key={text(a.id)}>
                      <td>{text(a.alert_date)}</td>
                      <td>{text(a.registration)}</td>
                      <td>
                        {driverNames(
                          text(a.registration),
                          text(a.alert_date)
                        )}
                      </td>
                      <td>{text(a.alert_type)}</td>
                      <td>{text(a.description)}</td>
                      <td>{text(a.severity)}</td>
                      <td>{text(a.event_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "assignments" && (
          <section className="panel">
            <div className="panel-head">
              <h2>Vehicle assignments</h2>
              <span>{filteredAssignments.length} records</span>
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
                      <th key={heading}>{heading}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredAssignments.map((a) => (
                    <tr key={text(a.id)}>
                      <td>{text(a.assignment_date)}</td>
                      <td>{text(a.registration)}</td>
                      <td>{assignmentName(a)}</td>
                      <td>{text(a.inspector_id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "import" && manager && (
          <section className="panel import">
            <h2>Import Google Sheets CSV exports</h2>

            <p>
              Export each sheet as CSV, then upload it here.
              Importing does not delete existing data.
            </p>

            {[
              ["vehicles", "Vehicle Map"],
              ["inspections", "Driver Assignments (DVIC)"],
              ["alerts", "Netradyne Data"],
              ["assignments", "Driver assignments mapping"],
            ].map(([kind, label]) => (
              <label key={kind} className="upload">
                {label}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={uploading}
                  onChange={(e) => upload(e, kind)}
                />
              </label>
            ))}

            <p className="muted">
              Driver accounts must be linked to their
              inspector IDs before their records become
              visible.
            </p>

            <p>{uploadMessage}</p>
          </section>
        )}
      </main>
    </div>
  );
}
