export function Slide({ slide }) {
  const picture = slide.imageUrl || slide.dataUrl
  if (slide.kind === 'image') {
    return (
      <figure className="slide slide-image">
        {picture && <img src={picture} alt={slide.caption || 'Слайд'} />}
        {slide.caption && <figcaption>{slide.caption}</figcaption>}
      </figure>
    )
  }
  return (
    <article className={`slide ${slide.tone || 'orbit'}`}>
      {slide.kicker && <p className="slide-kicker">{slide.kicker}</p>}
      <h2>{slide.title}</h2>
      <ul>
        {slide.lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
      {picture && <img className="slide-picture" src={picture} alt="" />}
    </article>
  )
}
