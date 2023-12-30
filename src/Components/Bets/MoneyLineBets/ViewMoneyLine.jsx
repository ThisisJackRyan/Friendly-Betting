import React from 'react';
import css from './MoneyLine.module.css';
import Players from '../Players/Players';

const ViewMoneyLine = (props) => {

    const bet = props.location ? props.location.state.bet : {};

    const viewBet = () => {
        
        console.log(bet);
        
    }
    return (
        bet !== undefined ? (
        <div onClick={viewBet} className='flex'>asss</div>
        // <div className='flex'>
        // <div className='x2'>
        //     <form className={css.MoneyLine}>
        //     <div className={css.betContainer}>
        //         Bet:
        //         <div className={css.bet}>
        //             <h3>{bet.bet}</h3>
        //         </div>
        //     </div>
        //     <div className='flex'>
        //         <div className={css.contestant}>
        //             <div><span className={css.label}>Contestant 1</span></div>
        //             <h4><span>{bet.contestant1}</span></h4>
        //             <div className={css.odds}>
        //                 <span>(+ or - odds)</span>
        //                 <p><span>{bet.contestant1Odds}</span></p>
        //             </div>
        //         </div>
        //         <div className={css.contestant}>
        //             <div><span className={css.label}>Contestant 2</span></div>
        //             <h4><span>{bet.contestant2}</span></h4>
        //             <div className={css.odds}>
        //                 <span>(+ or - odds)</span>
        //                 <p><span>{bet.contestant2Odds}</span></p>
        //             </div>
        //         </div>
        //     </div>
                
        //     <button type="submit">Create Bet</button>
        //     </form>
        // </div>
        // <div className="x1">
        //     <Players />
        // </div>
    //</div>
        ) : (
            <div>
                <h1>404</h1>
                <p>Sorry, this page does not exist</p>
            </div>
        )
    );
};

export default ViewMoneyLine;
