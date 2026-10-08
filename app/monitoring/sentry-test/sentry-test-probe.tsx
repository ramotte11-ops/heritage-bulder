"use client";

import { FormEvent, useState } from "react";

type ProbeResult = {
  delivered?: boolean;
  eventId?: string;
};

export function SentryTestProbe() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "delivered" | "failed">("idle");
  const [eventId, setEventId] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setEventId(null);

    try {
      const response = await fetch("/api/monitoring/sentry-test", {
        method: "POST",
        headers: { "x-heritage-sentry-test-token": token },
      });
      const result = (await response.json().catch(() => ({}))) as ProbeResult;

      if (response.status === 202 && result.delivered === true && result.eventId) {
        setStatus("delivered");
        setEventId(result.eventId);
      } else {
        setStatus("failed");
      }
    } catch {
      setStatus("failed");
    } finally {
      setToken("");
    }
  }

  return (
    <main>
      <h1>Sentry V1 controlled verification</h1>
      <p>This page is available only when the temporary Deploy Preview test gate is configured.</p>
      <form onSubmit={submit}>
        <label htmlFor="sentry-test-token">Temporary test token</label>
        <input
          id="sentry-test-token"
          type="password"
          autoComplete="off"
          required
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <button type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Trigger controlled error"}
        </button>
      </form>
      {status === "delivered" ? (
        <p role="status">Delivered to Sentry. Event ID: {eventId}</p>
      ) : null}
      {status === "failed" ? <p role="alert">Verification failed.</p> : null}
    </main>
  );
}
