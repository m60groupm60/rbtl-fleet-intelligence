import './style.css';import type {Metadata} from 'next';
export const metadata:Metadata={title:'RBTL Fleet Intelligence',description:'RBTL fleet operations and driver intelligence'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
