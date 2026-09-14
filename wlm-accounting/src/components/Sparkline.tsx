import React from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { C, CHART } from "../lib/theme";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

/**
 * The trend line inside a stat tile. Single series, so no legend — the tile's
 * label says what is plotted. 2px line with a ringed end marker, per the mark specs.
 */
export default function Sparkline({
  data,
  width = 120,
  height = 36,
  color = C.orange,
}: SparklineProps) {
  if (data.length < 2) return <View style={{ width, height }} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = CHART.markerRadius + CHART.surfaceGap;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const x = (i: number) => pad + (i / (data.length - 1)) * innerW;
  const y = (v: number) => pad + innerH - ((v - min) / span) * innerH;

  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${height} L${x(0)},${height} Z`;
  const lastX = x(data.length - 1);
  const lastY = y(data[data.length - 1]);

  return (
    <Svg width={width} height={height}>
      <Path d={area} fill={color} fillOpacity={CHART.areaOpacity} />
      <Path
        d={line}
        stroke={color}
        strokeWidth={CHART.lineWidth}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Surface ring keeps the end marker legible where it crosses the line. */}
      <Circle cx={lastX} cy={lastY} r={CHART.markerRadius + CHART.surfaceGap} fill={C.panel} />
      <Circle cx={lastX} cy={lastY} r={CHART.markerRadius} fill={color} />
    </Svg>
  );
}
