import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

export const HomeIcon = ({ size = 22, color = '#FFFFFF' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path
      d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z"
    />
    <Path
      d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z"
    />
  </Svg>
);

export const LogWeightIcon = ({ size = 22, color = '#FFFFFF' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
    <Path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12"
    />
  </Svg>
);

export const ProgressIcon = ({ size = 22, color = '#FFFFFF' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path fillRule="evenodd" clipRule="evenodd"
      d="M2.25 13.5a.75.75 0 0 1 .75-.75h3a2.25 2.25 0 0 1 2.25 2.25v4.5a.75.75 0 0 1-.75.75h-3A2.25 2.25 0 0 1 2.25 18v-4.5Zm6.75-3a.75.75 0 0 1 .75-.75h3a2.25 2.25 0 0 1 2.25 2.25v7.5a.75.75 0 0 1-.75.75h-3a2.25 2.25 0 0 1-2.25-2.25v-7.5Zm6.75-4.5a.75.75 0 0 1 .75-.75h3A2.25 2.25 0 0 1 21.75 7.5V19.5a.75.75 0 0 1-.75.75h-3a2.25 2.25 0 0 1-2.25-2.25V6Z"
    />
  </Svg>
);
