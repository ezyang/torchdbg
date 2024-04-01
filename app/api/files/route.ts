// app/api/files/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get('file');

  if (file) {
    const filePath = path.join(process.cwd(), file);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return new NextResponse(fileContent);
  } else {
    const currentDir = process.cwd();
    const files = fs.readdirSync(currentDir);
    return NextResponse.json({ files });
  }
}
