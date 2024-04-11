import React from 'react';
import css from './Players.module.css';
import QRCode from 'react-qr-code';
import {useState} from 'react';





const ShareBet = (props) => {

    function copyToClipboard() {
        navigator.clipboard.writeText(window.location.href)
    }
    const handleSubmit = (e) => {
        e.preventDefault();
        // Logic to share the bet
        console.log('Sharing bet');
    }

    return (
        
        <div>
            <div className='fixed-center text-2xl p-8 px-16 bg-spring-green-light rounded-md box-shadow-no-hover'>
                <div className="flex justify-end mb-2 "><span className={css.x} onClick={props.display}>x</span></div>
                <div className='justify-center text-center text-4xl mb-6 '><span className='border-bottom'>Share</span></div>
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
                    <button className={css.copyButton} onClick={copyToClipboard}>Copy</button>
                </div>
                    
            </div>
        </div>






        // <div className={`bg-secondary-spring-green-light ${css.shareBet}`}>
        //     <div className="flex justify-end mb-2"><span className={css.x} onClick={props.display}>x</span></div>
        //     <div className={`justify-center text-center ${css.friendsLabel}`}><span>Share</span></div>
            
        //     <div className={css.border}>
        //         <QRCode
        //             title="qr-code"
        //             value={window.location.href}
        //             bgColor="#FFFFFF"
        //             fgcolor="#000000"
        //             size="254"
        //         />
        //     </div>
        //     <div className='flex  max-w-64 m-4'>
        //         <div className={css.urlCopy}>
        //             {window.location.href}
        //         </div>
        //         <button className={css.copyButton} onClick={copyToClipboard}>Copy</button>
        //     </div>

        // </div>
        
    );
};

export default ShareBet;
