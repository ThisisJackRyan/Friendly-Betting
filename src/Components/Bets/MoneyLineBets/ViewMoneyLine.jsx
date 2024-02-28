import React from 'react';
import Buttons from '../../Components/Buttons';

const ViewMoneyLine = ({bets}) => {
    return (     
        <div className='blob'>
            <div className="flex justify-center items-center gap-8 my-4 mx-8 ">
                <Buttons text="Bet" a="greenButton" size="big"></Buttons>
                <h2>{bets.contestant1} </h2>
                {bets.contestant1Odds > 0 ? <p className='green'>(+{bets.contestant1Odds})</p> : <p className="red">({bets.contestant1Odds})</p>}
            </div>
            <hr />
            <div className="flex justify-center items-center gap-8 my-4 mx-8">
                <Buttons text="Bet" a="greenButton" size="big"></Buttons>
                <h2>{bets.contestant2} </h2>
                {bets.contestant2Odds > 0 ? <p className='green'>(+{bets.contestant2Odds})</p> : <p className='red'>({bets.contestant2Odds})</p>}
            </div>
        </div>
                    
              
    );
};

export default ViewMoneyLine;
