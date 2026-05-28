import React from 'react';

interface Props {
  urls: string[];
  max?: number;
  size?: number;
}

export const AvatarStack: React.FC<Props> = ({ urls, max = 3, size = 24 }) => {
  const shown = urls.slice(0, max);
  const overflow = urls.length - max;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', marginLeft: 4 }}>
      {shown.map((url, i) => (
        <img
          key={i}
          src={url}
          alt=""
          style={{
            width: size,
            height: size,
            borderRadius: 0,
            border: '2px solid rgba(255,255,255,0.15)',
            marginLeft: i === 0 ? 0 : -8,
            objectFit: 'cover',
          }}
        />
      ))}
      {overflow > 0 && (
        <span
          style={{
            marginLeft: 2,
            fontSize: 11,
            color: 'rgba(255,255,255,0.5)',
            fontWeight: 600,
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
};
