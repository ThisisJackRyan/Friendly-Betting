import React from 'react';
import css from './Players.module.css';
import QRCode from 'react-qr-code';





const ShareBet = (props) => {

    return (
        
        <div>
            <div className='fixed-center text-2xl p-8 px-16 bg-blue-gray rounded-md box-shadow-no-hover'>
                <div className="flex justify-end mb-2 "><span className={css.x} onClick={props.display}>x</span></div>
                <div className='justify-center text-center text-4xl mb-6 text-white '><span className='border-bottom-white'>Share</span></div>
                <div className={css.border}>
                    <QRCode
                        title="qr-code"
                        value={window.location.href}
                        bgColor="#FFFFFF"
                        fgcolor="#000000"
                        size="254"
                    />
                </div>
                <div className='flex max-w-64 mt-4'>
                    <div className={css.urlCopy}>
                            {window.location.href}
                        </div>
                    <button className={css.copyButton} onClick={() => navigator.clipboard.writeText(window.location.href)}>Copy</button>
                </div>
                    
            </div>
        </div>        
    );
};

export default ShareBet;
