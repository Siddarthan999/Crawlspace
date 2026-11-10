import { useCountUp } from "../hooks/useCountUp";

export default function CountUp({ value, decimals = 0 }: { value: number | null | undefined; decimals?: number }) {
  const animated = useCountUp(value);
  if (animated == null) return <>—</>;
  return <>{decimals ? animated.toFixed(decimals) : Math.round(animated)}</>;
}
