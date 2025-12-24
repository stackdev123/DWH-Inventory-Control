
import React from 'react';
import QRCode from 'react-qr-code';
import { LabelData } from '../types';

interface LabelPreviewProps {
  data: LabelData;
  scale?: number;
  className?: string;
}

const LabelPreview: React.FC<LabelPreviewProps> = ({ data, scale = 1, className = '' }) => {
  // Dimensions: 10cm x 7cm
  
  const formatDate = (dateString: string) => {
    if (!dateString) return "---";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "---";
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    } catch {
      return dateString;
    }
  };
  
  return (
    <div 
      className={`bg-white text-black font-sans box-border overflow-hidden relative flex flex-col border border-black ${className}`}
      style={{
        width: '10cm',
        height: '7cm',
        transform: scale !== 1 ? `scale(${scale})` : 'none',
        transformOrigin: 'top left',
        flexShrink: 0,
        pageBreakInside: 'avoid',
        boxSizing: 'border-box'
      }}
    >
      {/* Header: Item Name + Batch Code */}
      <div className="w-full border-b-2 border-black flex items-center justify-center bg-white px-1" style={{ height: '0.8cm' }}>
        <h1 className="font-bold uppercase text-center leading-none w-full line-clamp-1 flex flex-col items-center justify-center" style={{ fontSize: '13px' }}>
          <span className="line-clamp-1 px-1">{data.item.name || "Item Name"}</span>
          <span className="font-mono text-[10px] font-normal mt-0.5 leading-none">({data.item.batchCode || "-"})</span>
        </h1>
      </div>

      {/* Body: QR and Details */}
      <div className="flex-1 flex flex-row relative h-full">
        
        {/* Left: QR Code */}
        <div className="flex items-center justify-center p-2 border-r-2 border-black" style={{ width: '4.2cm' }}>
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <QRCode
              size={256}
              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
              value={data.item.code || "NO-CODE"}
              viewBox={`0 0 256 256`}
              level="M" 
              bgColor="#FFFFFF"
              fgColor="#000000"
            />
          </div>
        </div>

        {/* Right: Details Table - Enlarged Fonts */}
        <div className="flex-1 flex flex-col justify-center px-3 py-1 bg-white">
          <table className="w-full border-collapse font-bold table-fixed h-full">
            <tbody className="divide-y divide-gray-100">
              {/* ID */}
              <tr style={{ height: '25%' }}>
                <td className="w-[50px] align-middle text-slate-800 text-[14px]">ID</td>
                <td className="w-[12px] align-middle text-center text-[14px]">:</td>
                <td className="align-middle font-mono text-[14px] break-all leading-tight text-black">{data.item.code || "---"}</td>
              </tr>

              {/* Supplier */}
              <tr style={{ height: '25%' }}>
                <td className="align-middle text-slate-800 text-[14px]">Supp</td>
                <td className="align-middle text-center text-[14px]">:</td>
                <td className="align-middle leading-tight break-words whitespace-normal text-[14px] text-black">
                   {data.supplier || "---"}
                </td>
              </tr>

              {/* Arrival */}
              <tr style={{ height: '25%' }}>
                <td className="align-middle text-slate-800 text-[14px]">In</td>
                <td className="align-middle text-center text-[14px]">:</td>
                <td className="align-middle text-[14px] text-black">{formatDate(data.arrivalDate)}</td>
              </tr>

              {/* Expiry */}
              <tr style={{ height: '25%' }}>
                <td className="align-middle text-slate-800 text-[14px]">Exp</td>
                <td className="align-middle text-center text-[14px]">:</td>
                <td className="align-middle text-[14px] text-black">{data.expiryDate ? formatDate(data.expiryDate) : "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer: Signature */}
      <div className="border-t-2 border-black flex flex-col items-center justify-start bg-white pt-2" style={{ height: '2.0cm' }}>
         <span className="text-[12px] font-bold uppercase tracking-wider text-black">VERIFIED SIGNATURE</span>
         <div className="mt-8 border-t border-black w-32"></div>
      </div>

    </div>
  );
};

export default LabelPreview;
