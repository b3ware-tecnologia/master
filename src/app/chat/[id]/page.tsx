import {PublicWebChat} from "@/components/public-web-chat";
export const metadata={title:"Conversa | BM Crédito",referrer:"no-referrer",robots:{index:false,follow:false}};
export default async function ChatPage({params}:{params:Promise<{id:string}>}){return <PublicWebChat id={(await params).id}/>;}
