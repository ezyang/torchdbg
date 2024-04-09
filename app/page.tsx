"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const Debugger = dynamic(() => import("../components/Debugger"), {
  ssr: false,
});

export default function Main() {
  return <Debugger />;
}
