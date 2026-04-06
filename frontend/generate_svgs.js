const fs = require('fs');
const path = require('path');

const iconD = 'M40 40H90L140 90L90 140H40V40ZM70 70V110H90L110 90L90 70H70Z';
const iconA = 'M15 76H130V55L170 90L130 125V104H15Z';

function writeSvg(file, width, height, isCircle, scale, tx, ty, strokeW, textParams) {
  const clipX = 80 * scale + tx;
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="bowl-clip">
      <rect x="${clipX}" y="0" width="${width}" height="${height}" />
    </clipPath>
  </defs>

  <style>
    .bg { fill: #FFFFFF; }
    .mark { fill: #DC2626; }
    .gap { stroke: #FFFFFF; stroke-width: ${strokeW}; stroke-linejoin: miter; stroke-linecap: butt; }
    ${textParams ? '.text { fill: #111827; font-family: Georgia, "Times New Roman", serif; font-weight: 700; font-size: 110px; letter-spacing: 0.18em; }' : ''}
    @media (prefers-color-scheme: dark) {
      .bg { fill: #000000; }
      .mark { fill: #FFFFFF; }
      .gap { stroke: #000000; }
      ${textParams ? '.text { fill: #FFFFFF; }' : ''}
    }
  </style>

  ${isCircle ? `<circle cx="${width/2}" cy="${height/2}" r="${width/2}" class="bg"/>` : `<rect width="${width}" height="${height}" class="bg"/>`}

  <g transform="translate(${tx}, ${ty}) scale(${scale})">
    <!-- 1. Full D (Back) -->
    <path class="mark" fill-rule="evenodd" d="${iconD}"/>
    
    <!-- 2. Gap for Arrow (cuts D spine) -->
    <path class="gap" fill="none" d="${iconA}"/>
    
    <!-- 3. Arrow (Middle) -->
    <path class="mark" d="${iconA}"/>

    <!-- 4. Gap for Bowl (cuts Arrow) -->
    <path class="gap" fill="none" clip-path="url(#bowl-clip)" d="${iconD}"/>

    <!-- 5. Bowl (Front) -->
    <path class="mark" fill-rule="evenodd" clip-path="url(#bowl-clip)" d="${iconD}"/>
  </g>

  ${textParams ? `<text x="${textParams.x}" y="${textParams.y}" class="text" text-anchor="start">DISPATCH</text>` : ''}
</svg>
`;

  fs.writeFileSync(path.join('c:/dev-folder/Dispatch/frontend/public', file), svg);
  console.log(`Updated ${file}`);
}

writeSvg('icon.svg', 180, 180, false, 1, -2.5, 0, 6);
writeSvg('dispatch-sign.svg', 512, 512, false, 2.4, 34, 40, 14.4);
writeSvg('dispatch-social.svg', 400, 400, true, 2, 15, 20, 12);
writeSvg('dispatch-logo.svg', 980, 260, false, 1.6, 26, -14, 9.6, {x: 320, y: 165});
