import Image from "next/image";

export default function NisarSatellite() {
  return (
    <div className="nisar-orbit" role="img" aria-label="Satélite NISAR orbitando la Tierra">
      <div className="nisar-orbit-plane" aria-hidden="true">
        <div className="nisar-orbit-path" />
        <div className="nisar-satellite-anchor">
          {/* NASA/JPL-Caltech official deployed-spacecraft rendering. */}
          <Image
            className="nisar-spacecraft"
            src="/nisar-side-tilt.png"
            alt=""
            width={2500}
            height={2160}
            sizes="(max-width: 720px) 145px, 220px"
            priority
          />
        </div>
      </div>
    </div>
  );
}
