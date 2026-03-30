const renderer = require('./server/render/renderer');

async function test() {
  console.log('🎠 Testing Carousel render (v1)...');
  const data = {
    slides: [
      { type: 'cover', title: 'INTEL BRIEF', desc: 'Today\'s top stories from Nigeria & West Africa' },
      {
        type: 'story',
        headline: 'Inside the PDP Convention',
        sector: 'Politics',
        bullets: [
          'Key stakeholders gather to define the party\'s path forward',
          'Tension rises over candidate selection for 2027 elections',
          'Party chair calls for unity amid internal revolt'
        ],
        image_url: 'https://images.unsplash.com/photo-1529516548873-9ce57c8f155e?w=1080&q=85'
      },
      {
        type: 'story',
        headline: 'Samson Adamu Named New CAF General Secretary',
        sector: 'Sports',
        bullets: [
          'Nigerian administrator appointed acting General Secretary of CAF',
          'Appointment signals Nigeria\'s growing influence in African football',
          'Adamu takes over from predecessor amid governance reforms'
        ],
        image_url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1080&q=85'
      },
      { type: 'cta', headline: 'Read the full brief.', sub: 'Subscribe free at paperly.online' }
    ]
  };

  try {
    const files = await renderer.renderCarousel(data, '1');
    console.log(`✅ Rendered ${files.length} slides:`);
    files.forEach(f => console.log(` - data/output/${f}`));
  } catch(e) {
    console.error('❌ Error:', e.message);
  }
}
test();
