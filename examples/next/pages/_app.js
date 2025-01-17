import '@/styles/globals.css'
import Head from 'next/head'

export default function App({ Component, pageProps }) {
  return <>
  <Head>
    <meta http-equiv="Content-Security-Policy" content="connect-src 'self' https://testnet.polybase.xyz" />
  </Head>
  <Component {...pageProps} />
  </>
}
