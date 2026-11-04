
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
