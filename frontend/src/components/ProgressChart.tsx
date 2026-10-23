import React, { useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';

export interface ChartPoint {
  label: string;
  value: number;
}

interface Props {
  points: ChartPoint[];
  formatValue: (v: number) => string;
  color?: string;
}

const HEIGHT = 210;
const PAD = { top: 24, right: 20, bottom: 30, left: 52 };

export default function ProgressChart({ points, formatValue, color = '#FF6B35' }: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (width === 0 || points.length === 0) {
    return <View style={styles.container} onLayout={onLayout} />;
  }

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const pad = min === max ? Math.max(Math.abs(min) * 0.05, 1) : (max - min) * 0.2;
  min -= pad;
  max += pad;

  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const bottom = PAD.top + innerH;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const y = (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const areaPath = `${linePath} L${x(points.length - 1)},${bottom} L${x(0)},${bottom} Z`;
  const ticks = [0, 0.5, 1].map((t) => min + (max - min) * t);
  const labelStep = Math.ceil(points.length / 5);

  return (
    <View style={styles.container} onLayout={onLayout} testID="progress-chart">
      <Svg width={width} height={HEIGHT}>
        <Defs>
          <LinearGradient id="progressArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {ticks.map((t) => (
          <React.Fragment key={t}>
            <Line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="#333" strokeDasharray="4 4" />
            <SvgText x={PAD.left - 8} y={y(t) + 4} fill="#888" fontSize={11} textAnchor="end">
              {formatValue(t)}
            </SvgText>
          </React.Fragment>
        ))}

        {points.length > 1 && <Path d={areaPath} fill="url(#progressArea)" />}
        {points.length > 1 && <Path d={linePath} stroke={color} strokeWidth={3} fill="none" strokeLinejoin="round" />}

        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          return (
            <React.Fragment key={`${p.label}-${i}`}>
              <Circle cx={x(i)} cy={y(p.value)} r={isLast ? 7 : 5} fill={isLast ? color : '#1E1E1E'} stroke={color} strokeWidth={2.5} />
              {isLast && (
                <SvgText x={x(i)} y={y(p.value) - 12} fill="#FFF" fontSize={12} fontWeight="bold" textAnchor={points.length > 1 ? 'end' : 'middle'}>
                  {formatValue(p.value)}
                </SvgText>
              )}
              {(i % labelStep === 0 || isLast) && (
                <SvgText x={x(i)} y={HEIGHT - 8} fill="#888" fontSize={11} textAnchor="middle">
                  {p.label}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: HEIGHT,
  },
});
