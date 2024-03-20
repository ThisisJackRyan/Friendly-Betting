import React from 'react';
import Buttons from '../../Components/Buttons';

const ViewMoneyLine = ({bets}) => {
    return (     
        <div className="flex justify-center items-center">
            <div className="blob">
                <div className="flex">
                    <div className='flex flex-col gap-8 m-4 items-center'>
                        <Buttons text="Bet" a="greenButton" size="big"></Buttons>
                        <Buttons text="Bet" a="greenButton" size="big"></Buttons>
                    </div>
                    <div className='flex flex-col gap-8 m-4 items-center'>
                        <div className='py-4'>{bets.contestant1}</div>
                        <div className='py-4'>{bets.contestant2}</div>
                    </div>
                    <div className='flex flex-col gap-8 m-4 items-center'>
                        {bets.contestant1Odds > 0 ? <p className='green flex justify-center bg-blue-gray w-full rounded-md p-4'>(+{bets.contestant1Odds})</p> : <p className="red  flex justify-center bg-blue-gray w-full rounded-md p-4">({bets.contestant1Odds})</p>}
                        {bets.contestant2Odds > 0 ? <p className='green flex justify-center bg-blue-gray w-full rounded-md p-4'>(+{bets.contestant2Odds})</p> : <p className='red  flex justify-center bg-blue-gray w-full rounded-md p-4'>({bets.contestant2Odds})</p>}
                    </div>
                </div>
            </div>
        </div> 
    );
};

export default ViewMoneyLine;
