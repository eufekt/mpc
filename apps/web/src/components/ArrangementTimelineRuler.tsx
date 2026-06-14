import {
  clipWidthPx,
  formatDuration,
  rulerTickInterval,
  seekTimeFromClientX,
  timeToPx,
} from "../lib/arrangement";

type Props = {
  duration: number;
  onSeek: (time: number) => void;
};

export function ArrangementTimelineRuler({ duration, onSeek }: Props) {
  const widthPx = Math.max(clipWidthPx(duration), 1);
  const interval = rulerTickInterval(Math.max(duration, 1));
  const ticks: number[] = [];
  const maxTime = Math.max(duration, interval);
  for (let t = 0; t <= maxTime; t += interval) {
    ticks.push(t);
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onSeek(seekTimeFromClientX(e.clientX, e.currentTarget));
  };

  return (
    <div
      className="arrangement-timeline-ruler"
      style={{ width: `${widthPx}px` }}
      onClick={handleClick}
      role="slider"
      aria-label="Timeline"
      aria-valuemin={0}
      aria-valuemax={duration}
    >
      {ticks.map((time) => (
        <div
          key={time}
          className="arrangement-ruler-tick"
          style={{ left: `${timeToPx(time)}px` }}
        >
          <span className="arrangement-ruler-label">
            {formatDuration(time)}
          </span>
        </div>
      ))}
    </div>
  );
}
