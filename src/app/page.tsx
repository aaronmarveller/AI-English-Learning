import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-h1">Greeting Somebody</h1>
      <p className="text-body text-muted">
        项目脚手架与设计系统已就绪，课程页面将在后续 ticket 中实现。
      </p>
      <Link href="/style-guide" className="btn-primary">
        查看样式基准页
      </Link>
    </main>
  );
}
