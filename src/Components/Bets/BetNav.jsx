import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const BetNav = () => {
    const navigate = useNavigate();

    const goToMoneyLine = () => {
        navigate('/Friendly-Betting/MoneyLineBets')
    }
    const goToOverUnder = () => {
        navigate('/Friendly-Betting/OverUnderBets')
    }
    const goToProps = () => {
        navigate('/Friendly-Betting/PropBets')
    }
  return (
    <div className='betNav'>
        <h1><span>Bets</span></h1>
        <div className='BettingLinks'>
            <div>
                <div onClick={goToMoneyLine} className='Link' >Money Line Bets</div>
            </div>
            <div>
                <div onClick={goToOverUnder} className='Link' >Over / Under Bets</div>
            </div>
            <div>
                <div onClick={goToProps} className='Link' >Prop Bets</div>
            </div>
        </div>
    </div>
  );
};

export default BetNav;
