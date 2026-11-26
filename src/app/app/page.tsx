import Image from "next/image";

export default function AppHome() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center">
      <div className="relative h-4/5 w-4/5">
        <Image src="/brand/workspace-logo.gif" alt="STO.AUTOREMHUB" fill unoptimized priority sizes="80vw" className="object-contain" />
      </div>
    </div>
  );
}
