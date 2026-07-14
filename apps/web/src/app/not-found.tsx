import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-page" data-scrollable="true">
      <section className="not-found-page__card" aria-labelledby="not-found-title">
        <div className="not-found-page__map" aria-hidden="true" />
        <p className="not-found-page__eyebrow">区域坐标丢失</p>
        <p className="not-found-page__code" aria-hidden="true">
          404
        </p>
        <h1 className="not-found-page__title" id="not-found-title">
          这片区域尚未开放...
        </h1>
        <p className="not-found-page__description">
          你似乎走出了当前地图边界。回到主城区，继续今天的教学任务吧。
        </p>
        <Link className="not-found-page__link" href="/">
          返回主城区
        </Link>
      </section>
    </main>
  );
}
