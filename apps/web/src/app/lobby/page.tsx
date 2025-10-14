import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
     <h1 className ="heading">Welcome To The Lobby</h1>
     <Link href="/game">
       <button type="button" className="btn btn-cyan">Take me to the Game</button>
      </Link>
    </div>
  );
}
