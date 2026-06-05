import React, { useEffect, useState } from "react";

function diff(target) {
  const ms = Math.max(0, target - Date.now());
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms / 3_600_000) % 24),
    minutes: Math.floor((ms / 60_000) % 60),
    seconds: Math.floor((ms / 1000) % 60),
    done: ms === 0,
  };
}

export default function Countdown({ target }) {
  const targetMs = target instanceof Date ? target.getTime() : new Date(target).getTime();
  const [time, setTime] = useState(() => diff(targetMs));

  useEffect(() => {
    const id = setInterval(() => setTime(diff(targetMs)), 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  const units = [
    { value: time.days, label: "Days" },
    { value: time.hours, label: "Hours" },
    { value: time.minutes, label: "Min" },
    { value: time.seconds, label: "Sec" },
  ];

  return (
    <div className="flex items-stretch justify-center gap-2 sm:gap-3">
      {units.map((unit) => (
        <div
          key={unit.label}
          className="min-w-[72px] border border-ink bg-white px-4 py-3"
        >
          <div className="text-3xl font-black tabular-nums text-signal sm:text-4xl">
            {String(unit.value).padStart(2, "0")}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-ink/50">
            {unit.label}
          </div>
        </div>
      ))}
    </div>
  );
}
