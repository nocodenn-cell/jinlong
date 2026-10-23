import Script from 'next/script'
import { GA_ID, GADS_ID, PIXEL_ID } from '@/lib/track'
export default function Tracking() {
  const gtagId = GA_ID || GADS_ID
  return <>
    {gtagId && <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`} strategy="afterInteractive" />
      <Script id="gtag" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());${GA_ID ? `gtag('config','${GA_ID}');` : ''}${GADS_ID ? `gtag('config','${GADS_ID}');` : ''}`}</Script>
    </>}
    {PIXEL_ID && <Script id="fbq" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');fbq('track','PageView');`}</Script>}
  </>
}
