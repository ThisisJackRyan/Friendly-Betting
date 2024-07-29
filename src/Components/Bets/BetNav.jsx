import React, {useState} from 'react';
import {useNavigate } from 'react-router-dom';
import css from './Bets.module.css';
import { BsCaretDownFill, BsCaretUpFill} from "react-icons/bs";


// should look into new way to do this using ref 
import { CSSTransition } from 'react-transition-group';
import Logo from '../Components/Static/Logo';

const BetNav = ({swap}) => {

    const [isOpenMoneyLine, setIsOpenMoneyLine] = useState(false);
    const [isOpenOverUnder, setIsOpenOverUnder] = useState(false);
    const [isOpenProp, setIsOpenProp] = useState(false);

    const [showBoth, setShowBoth] = useState(true);

    const handleShowBoth = (bool) => {
        setShowBoth(bool)
    }

    const [showProp, setShowProp] = useState(true);

    const handleShowProp = (bool) => {
        console.log("showProp:"+ bool)
        console.log("showBoth:" + showBoth)
        setShowProp(bool)
    }

    const handleClickExpand = (bet) => {
        // setTimeout(() => {
            if(bet === 'MoneyLine') {
                setIsOpenMoneyLine(!isOpenMoneyLine)
            } else if(bet === 'OverUnder') {
                setIsOpenOverUnder(!isOpenOverUnder)
            }
            else{
                setIsOpenProp(!isOpenProp)
            }
        // }, 300); // Delay in milliseconds
       
    } 

    const navigate = useNavigate();

    const goTo = (bet) => {
        navigate(`/Friendly-Betting/${bet}`)

    }
  return (
    
    <div className='fixed flex flex-col inset-0 bg-spring-green-light'>
        <Logo />
        <div className='flex flex-col h-full justify-between items-center max-w-screen-sm m-auto p-8'>
            <div className='flex flex-col gap-4 text-nowrap '>
                <div className='cursor-pointer flex flex-col justify-center items-center w-full max-w-64 md:max-w-screen-sm md:w-screen'>
                    <button className=" w-full flex justify-between items-center border-4 rounded-lg p-2 m-2 bg-secondary-spring-green-light    active:border-gray-50 duration-300 active:text-gray-50" onClick={() =>handleClickExpand("MoneyLine")} >
                        Money Line
                        <div className='flex justify-center items-center'>
                            {isOpenMoneyLine ? <BsCaretUpFill className='flex justify-center items-center' /> : <BsCaretDownFill className='lex justify-center items-center' />}
                        </div>
                    </button>
                    <CSSTransition
                        in={isOpenMoneyLine}
                        timeout={300}
                        classNames="fadeDown"
                        onEnter={() => handleShowBoth(false)}
                        onExited={() => handleShowBoth(true)}
                        unmountOnExit              
                    >
                        <div>
                            <div className='relative flex justify-center items-center  border-4 rounded-lg bg-secondary-spring-green-light'>
                                <span  className=' break-words whitespace-normal flex justify-center items-center p-2'>
                                Money Line bet is a type of wager where you place a bet on the outcome of an event with only two possible outcomes. 
                                In a Money line bet, you simply choose which side you think will win. 
                                </span>
                            </div>
                            <button className='flex justify-center w-full bg-blue-gray border-4 rounded-lg p-2 text-white active:border-gray-50' onClick={() => goTo("MoneyLineBets")}>
                                <span>
                                    Create One!
                                </span>
                            </button>
                        </div>
                    </CSSTransition>
                </div>
                <CSSTransition
                    in={!isOpenMoneyLine && showBoth}
                    timeout={0}
                    classNames="fadeInImmediately"
                    unmountOnExit
                >
                    <div className="cursor-pointer flex flex-col justify-center items-center w-full max-w-64 md:max-w-screen-sm md:w-screen transition duration-75 ease-in-out ">
                        <button className=" w-full flex justify-between items-center border-4 rounded-lg p-2 m-2 bg-secondary-spring-green-light active:border-gray-50 duration-300 active:text-gray-50" onClick={() => handleClickExpand("OverUnder")}>
                            Over / Under
                            <div className='flex justify-center items-center'>
                                {isOpenOverUnder ? <BsCaretUpFill className='flex justify-center items-center' /> : <BsCaretDownFill className='lex justify-center items-center' />}
                            </div>
                        </button>
                        
                        <CSSTransition
                            in={isOpenOverUnder}
                            timeout={300}
                            classNames="fadeDown"
                            onEnter={() => handleShowProp(false)}
                            onExited={() => handleShowProp(true)}
                            unmountOnExit              
                        >
                            <div>
                                <div className='relative flex justify-center items-center  border-4 rounded-lg bg-secondary-spring-green-light'>
                                    <span  className=' break-words whitespace-normal flex justify-center items-center p-2'>
                                    An over/under bet is a wager where you bet on if the combined 
                                    score of both teams or participants in a game, match, or event will be OVER or UNDER a predetermined number.
                                    </span>
                                </div>
                                <button className='flex justify-center w-full bg-blue-gray border-4 rounded-lg p-2 text-white active:border-gray-50' onClick={() => goTo("OverUnderBets")}>
                                    <span>
                                        Create One!
                                    </span>
                                </button>
                            </div>
                        </CSSTransition>
                    </div>
                </CSSTransition>
                <CSSTransition
                    in={!isOpenMoneyLine && !isOpenOverUnder && (showProp && showBoth)}
                    timeout={0}
                    classNames="fadeInImmediately"
                    unmountOnExit    
                >
                    <div className="cursor-pointer flex flex-col justify-center items-center w-full max-w-64 md:max-w-screen-sm md:w-screen transition duration-75 ease-in-out ">
                        <button className=" w-full flex justify-between items-center border-4 rounded-lg p-2 m-2 bg-secondary-spring-green-light active:border-gray-50 duration-300 active:text-gray-50" onClick={() => handleClickExpand("Prop")} >
                            Prop (Not Implemented)
                            <div className='flex justify-center items-center'>
                                {isOpenProp ? <BsCaretUpFill className='flex justify-center items-center' /> : <BsCaretDownFill className='lex justify-center items-center' />}
                            </div>
                        </button>
                        <CSSTransition
                            in={isOpenProp}
                            timeout={300}
                            classNames="fadeDown"
                            unmountOnExit              
                        >
                            <div>
                                <div className='relative flex justify-center items-center  border-4 rounded-lg bg-secondary-spring-green-light'>
                                    <span  className=' break-words whitespace-normal flex justify-center items-center p-2'>
                                    A prop bet is wager that focuses on specific occurrences within a game, 
                                    match, or event. Betters place bets on things like, the coin toss and the first team to score 
                                    or anything you can thing of!
                                    </span>
                                </div>
                                <button className='flex justify-center w-full bg-blue-gray border-4 rounded-lg p-2 text-white active:border-gray-50' onClick={() => goTo("PropBets")}>
                                    <span>
                                        Create One!
                                    </span>
                                </button>
                            </div>
                        </CSSTransition>
                    </div>
                </CSSTransition>
            </div>
            <div className="flex w-full max-w-64 justify-center items-center bg-blue-gray text-white rounded-md box-shadow py-2 md:max-w-screen-sm md:w-screen" onClick={swap}>
                    Close
            </div>
        </div>
    </div>
  );
};

export default BetNav;
