import React from 'react';
import CloseX from '../../../Components/Static/CloseX';

const Modal = (props) => {

    return (
        <div className='absolute bottom-0 inset-x-0 w-full md:max-w-screen-md md:m-auto'>
            <CloseX action={props.handleModal} divStyle="flex justify-end" IconStyle="text-3xl mr-1 mb-1 cursor-pointer rounded-full black-border" backgroundColor='#ddece0'/>
            <div className='px-4 pb-28 pt-12 bg-spring-green-light md:rounded-md'>
                <div className='text-center'>
                    <span className='border-bottom-dashed-blue-gray text-3xl font-medium rou'>Place Your Bet</span>
                </div>
                <div className=' flex flex-col pt-4 gap-6 m-4 text-2xl'>
                    <div className='w-1/2 m-auto'>
                        <button className='baseBetButton w-full rounded-md'>
                            {props.contestant1}
                        </button>
                    </div>
                    <div className='text-center'>or</div>
                    <div className='w-1/2 m-auto'>
                        <button className='baseBetButton  w-full rounded-md'>
                            {props.contestant2}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Modal;