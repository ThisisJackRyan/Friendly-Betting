import React from 'react';
import {useNavigate } from 'react-router-dom';
import css from './Bets.module.css';

const BetNav = (props) => {
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
    <div className="fixed-center bg-spring-green-light text-black p-4 rounded-md black-border box-shadow-no-hover">
        <div className="x"><span onClick={props.swap} >x</span></div>
        <div className='text-3xl flex justify-center items-center mb-4'><span className='border-bottom'>Bets</span></div>
        <div className="flex justify-center items-center flex-col gap-4 m-4">
            <div>
                <div onClick={goToMoneyLine} className={css.betNavLinks} >Money Line Bets</div>
            </div>
            <div>
                <div onClick={goToOverUnder} className={css.betNavLinks} >Over / Under Bets</div>
            </div>
            <div>
                <div onClick={goToProps} className={css.betNavLinks} >Prop Bets</div>
            </div>
        </div>
    </div>
  );
};

export default BetNav;
